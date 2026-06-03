import { shouldUseStubAdapters } from "@westbound/platform";

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}

export interface LlmCompleteResult {
  text: string;
  usage: TokenUsage;
}

export interface LlmCompleteOptions {
  maxTokens?: number;
  temperature?: number;
  productionRunId?: string;
}

export interface LlmClient {
  complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions
  ): Promise<LlmCompleteResult>;
}

export class StubLlmClient implements LlmClient {
  async complete(messages: LlmMessage[]): Promise<LlmCompleteResult> {
    const last = messages[messages.length - 1]?.content ?? "";
    return {
      text: JSON.stringify({
        stub: true,
        echo: last.slice(0, 200),
        generatedAt: new Date().toISOString(),
      }),
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  }
}

/** Sonnet 4 pricing per 1M tokens (USD cents per 1K tokens for addJobCost) */
export const SONNET_INPUT_CENTS_PER_1K = 0.3;
export const SONNET_OUTPUT_CENTS_PER_1K = 1.5;

export function tokenUsageToCostCents(usage: TokenUsage): number {
  return Math.ceil(
    (usage.inputTokens / 1000) * SONNET_INPUT_CENTS_PER_1K +
      (usage.outputTokens / 1000) * SONNET_OUTPUT_CENTS_PER_1K
  );
}

export async function createLlmClient(): Promise<LlmClient> {
  if (shouldUseStubAdapters()) {
    return new StubLlmClient();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicLlmClient } = await import("./anthropic.js");
    return new AnthropicLlmClient();
  }
  return new StubLlmClient();
}
