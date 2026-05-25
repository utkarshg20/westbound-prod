import type { GenerationResult, LipSyncInput, LipSyncProvider } from "./interfaces.js";
import { apiPost } from "./http.js";

export class HedraLipSyncProvider implements LipSyncProvider {
  readonly name = "hedra";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async sync(input: LipSyncInput): Promise<GenerationResult> {
    const data = await apiPost<{
      id?: string;
      video_url?: string;
      output_url?: string;
    }>(
      `${this.baseUrl}/v1/lipsync`,
      {
        video_url: input.videoUri,
        audio_url: input.audioUri,
        character_id: input.characterId,
      },
      { Authorization: `Bearer ${this.apiKey}` }
    );

    const id = data.id ?? crypto.randomUUID();
    return {
      id,
      uri: data.video_url ?? data.output_url ?? `hedra://${id}`,
      metadata: { videoUri: input.videoUri },
      costCents: 25,
    };
  }
}
