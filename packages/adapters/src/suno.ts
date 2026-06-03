import type {
  GenerationResult,
  MusicGenerateInput,
  MusicGenerator,
} from "./interfaces.js";
import { fetchJson } from "./fetch-hardened.js";

export class SunoMusicGenerator implements MusicGenerator {
  readonly name = "suno";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async generate(input: MusicGenerateInput): Promise<GenerationResult[]> {
    const n = input.variations ?? 4;
    const results: GenerationResult[] = [];

    for (let i = 0; i < n; i++) {
      const data = await fetchJson<{
        id?: string;
        audio_url?: string;
        url?: string;
        clips?: Array<{ id: string; audio_url?: string }>;
      }>(`${this.baseUrl}/api/generate`, {
        method: "POST",
        timeoutMs: 300_000,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          lyrics: input.lyrics,
          make_instrumental: input.instrumental ?? false,
          persona_id: input.personaId,
          wait_audio: true,
        }),
      });

      const clip = data.clips?.[0];
      const id = clip?.id ?? data.id ?? crypto.randomUUID();
      const uri = clip?.audio_url ?? data.audio_url ?? data.url ?? `suno://${id}`;

      results.push({
        id,
        uri,
        metadata: { prompt: input.prompt, personaId: input.personaId },
        costCents: 10,
      });
    }

    return results;
  }
}
