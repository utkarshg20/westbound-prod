export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmClient {
  complete(messages: LlmMessage[], options?: { maxTokens?: number }): Promise<string>;
}

export class StubLlmClient implements LlmClient {
  async complete(messages: LlmMessage[]): Promise<string> {
    const last = messages[messages.length - 1]?.content ?? "";
    return JSON.stringify({
      stub: true,
      echo: last.slice(0, 200),
      generatedAt: new Date().toISOString(),
    });
  }
}

export async function createLlmClient(): Promise<LlmClient> {
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicLlmClient } = await import("./anthropic.js");
    return new AnthropicLlmClient();
  }
  return new StubLlmClient();
}
