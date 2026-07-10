import type { PublishInput, Publisher } from "./interfaces.js";
import { fetchHardened } from "./fetch-hardened.js";

export interface CreatomateRenderInput {
  templateId: string;
  modifications: Record<string, unknown>;
}

export interface CreatomateRenderResult {
  id: string;
  status: string;
  url: string;
}

export class CreatomateClient {
  constructor(private readonly apiKey: string) {}

  async render(input: CreatomateRenderInput): Promise<CreatomateRenderResult> {
    const res = await fetchHardened("https://api.creatomate.com/v1/renders", {
      method: "POST",
      timeoutMs: 60_000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: input.templateId,
        modifications: input.modifications,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Creatomate render failed ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      id: string;
      status: string;
      url?: string;
    };

    return {
      id: data.id,
      status: data.status,
      url: data.url ?? `creatomate://${data.id}`,
    };
  }

  async getRender(renderId: string): Promise<CreatomateRenderResult> {
    const res = await fetchHardened(
      `https://api.creatomate.com/v1/renders/${renderId}`,
      {
        timeoutMs: 30_000,
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );
    if (!res.ok) {
      throw new Error(`Creatomate getRender failed ${res.status}`);
    }
    const data = (await res.json()) as {
      id: string;
      status: string;
      url?: string;
    };
    return {
      id: data.id,
      status: data.status,
      url: data.url ?? `creatomate://${data.id}`,
    };
  }

  /**
   * Poll until succeeded/failed or timeout.
   * Default: 60 attempts × 5s = 5 minutes.
   */
  async waitForRender(
    renderId: string,
    options?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<CreatomateRenderResult> {
    const maxAttempts = options?.maxAttempts ?? 60;
    const intervalMs = options?.intervalMs ?? 5_000;

    for (let i = 0; i < maxAttempts; i++) {
      const current = await this.getRender(renderId);
      if (current.status === "succeeded" || current.status === "failed") {
        return current;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Creatomate render timed out: ${renderId}`);
  }

  /** Render + poll to completion */
  async renderAndWait(
    input: CreatomateRenderInput
  ): Promise<CreatomateRenderResult> {
    const started = await this.render(input);
    if (started.status === "succeeded") return started;
    return this.waitForRender(started.id);
  }
}

/** Publisher shim for faceless long-form assembly metadata */
export class CreatomatePublisher implements Publisher {
  readonly platform = "creatomate";

  constructor(
    private readonly client: CreatomateClient,
    private readonly templateId: string
  ) {}

  async publish(input: PublishInput): Promise<{ externalId: string; url?: string }> {
    const mod = JSON.parse(input.description || "{}") as Record<string, unknown>;
    const render = await this.client.renderAndWait({
      templateId: this.templateId,
      modifications: mod,
    });
    return { externalId: render.id, url: render.url };
  }
}
