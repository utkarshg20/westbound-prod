import type { PublishInput, Publisher } from "./interfaces.js";
import { apiPost } from "./http.js";

export interface CreatomateRenderInput {
  templateId: string;
  modifications: Record<string, unknown>;
}

export class CreatomateClient {
  constructor(private readonly apiKey: string) {}

  async render(input: CreatomateRenderInput): Promise<{ id: string; url: string }> {
    const data = await apiPost<{
      id: string;
      status: string;
      url?: string;
    }>(
      "https://api.creatomate.com/v1/renders",
      {
        template_id: input.templateId,
        modifications: input.modifications,
      },
      { Authorization: `Bearer ${this.apiKey}` }
    );

    return { id: data.id, url: data.url ?? `creatomate://${data.id}` };
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
    const render = await this.client.render({
      templateId: this.templateId,
      modifications: mod,
    });
    return { externalId: render.id, url: render.url };
  }
}
