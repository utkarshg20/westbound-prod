import type { LlmClient, LlmMessage } from "./llm.js";

export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");
    this.apiKey = apiKey;
  }

  async complete(
    messages: LlmMessage[],
    options?: { maxTokens?: number }
  ): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content;
    const nonSystem = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: options?.maxTokens ?? 4096,
        system,
        messages: nonSystem.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const block = data.content.find((c) => c.type === "text");
    return block?.text ?? "";
  }
}
