import type {
  GenerationResult,
  VideoGenerateInput,
  VideoGenerator,
} from "./interfaces.js";
import { apiPost } from "./http.js";

export class KlingVideoGenerator implements VideoGenerator {
  readonly name = "kling";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async generate(input: VideoGenerateInput): Promise<GenerationResult> {
    const data = await apiPost<{
      task_id?: string;
      data?: { video_url?: string; url?: string };
      video_url?: string;
    }>(
      `${this.baseUrl}/v1/videos/image2video`,
      {
        prompt: input.prompt,
        image_url: input.imageUri,
        duration: input.durationSec ?? 5,
        character_id: input.characterId,
      },
      { Authorization: `Bearer ${this.apiKey}` }
    );

    const id = data.task_id ?? crypto.randomUUID();
    const uri =
      data.data?.video_url ?? data.data?.url ?? data.video_url ?? `kling://${id}`;

    return {
      id,
      uri,
      metadata: { prompt: input.prompt, shotType: input.shotType },
      costCents: 50,
    };
  }
}
