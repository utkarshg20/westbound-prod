import { randomUUID } from "node:crypto";
import type { GenerationResult, ImageGenerateInput, ImageGenerator } from "./interfaces.js";
import { ReplicateFluxClient } from "./replicate-flux.js";

export class ReplicateFluxImageGenerator implements ImageGenerator {
  readonly name = "replicate_flux";

  constructor(private readonly client: ReplicateFluxClient) {}

  async generate(input: ImageGenerateInput): Promise<GenerationResult> {
    const result = await this.client.generateImage(
      [input.prompt, input.loraVersion ? `lora:${input.loraVersion}` : ""]
        .filter(Boolean)
        .join(", ")
    );
    return {
      id: randomUUID(),
      uri: result.uri,
      metadata: {
        prompt: input.prompt,
        loraVersion: input.loraVersion,
        characterId: input.characterId,
      },
      costCents: result.costCents,
    };
  }
}
