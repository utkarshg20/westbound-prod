import { logger } from "@westbound/platform";
import { AnthropicMessageResponseSchema } from "./schemas.js";
import type {
  LlmClient,
  LlmCompleteOptions,
  LlmCompleteResult,
  LlmMessage,
  TokenUsage,
} from "./llm.js";

const RETRY_STATUSES = new Set([429, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000, 16000];
const TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");
    this.apiKey = apiKey;
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions
  ): Promise<LlmCompleteResult> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const systemBlocks: Array<{ type: string; text: string; cache_control?: { type: string } }> =
      [];
    if (systemMsg?.content) {
      const block: { type: string; text: string; cache_control?: { type: string } } = {
        type: "text",
        text: systemMsg.content,
      };
      if (systemMsg.content.length >= 1024) {
        block.cache_control = { type: "ephemeral" };
      }
      systemBlocks.push(block);
    }

    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 1,
      system: systemBlocks.length ? systemBlocks : undefined,
      messages: nonSystem.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2024-10-22",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
            const retryAfter = res.headers.get("retry-after");
            const waitMs = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : BACKOFF_MS[attempt] ?? 16000;
            logger.warn("Anthropic retry", {
              status: res.status,
              attempt: attempt + 1,
              productionRunId: options?.productionRunId,
            });
            await sleep(waitMs);
            continue;
          }
          throw new Error(`Anthropic API error: ${res.status} ${errText.slice(0, 500)}`);
        }

        const raw = await res.json();
        const parsed = AnthropicMessageResponseSchema.safeParse(raw);
        if (!parsed.success) {
          logger.error("Anthropic response parse failed", {
            productionRunId: options?.productionRunId,
            error: parsed.error.message,
          });
          throw new Error(`Anthropic response invalid: ${parsed.error.message}`);
        }

        const block = parsed.data.content.find((c) => c.type === "text");
        const text = block?.text ?? "";
        const u = parsed.data.usage;
        const usage: TokenUsage = {
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          cacheReadInputTokens: u?.cache_read_input_tokens ?? 0,
        };
        return { text, usage };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_ATTEMPTS - 1 && lastError.name === "TimeoutError") {
          await sleep(BACKOFF_MS[attempt] ?? 4000);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error("Anthropic request failed");
  }
}
