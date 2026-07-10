import type {
  GenerationResult,
  MusicGenerateInput,
  MusicGenerator,
} from "./interfaces.js";
import { fetchHardened } from "./fetch-hardened.js";

/**
 * Udio fallback music generator (Suno risk mitigation per vendor-verification).
 * Activate with MUSIC_PROVIDER=udio and UDIO_API_KEY.
 */
export class UdioMusicGenerator implements MusicGenerator {
  readonly name = "udio";

  constructor(
    private readonly apiKey: string,
    private readonly apiBase = process.env.UDIO_API_BASE ??
      "https://api.udio.com/v1"
  ) {}

  async generate(input: MusicGenerateInput): Promise<GenerationResult[]> {
    const n = input.variations ?? 4;
    if (!this.apiKey || this.apiKey.startsWith("fake")) {
      return Array.from({ length: n }, () => this.stub(input));
    }
    const results: GenerationResult[] = [];

    for (let i = 0; i < n; i++) {
      try {
        const res = await fetchHardened(`${this.apiBase}/generate`, {
          method: "POST",
          timeoutMs: 15_000,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: input.prompt,
            lyrics: input.lyrics,
            instrumental: input.instrumental ?? false,
          }),
        });

        if (!res.ok) {
          results.push(this.stub(input));
          continue;
        }

        const data = (await res.json()) as {
          id?: string;
          audio_url?: string;
          url?: string;
        };
        const id = data.id ?? crypto.randomUUID();
        results.push({
          id,
          uri: data.audio_url ?? data.url ?? `udio://${id}`,
          metadata: {
            prompt: input.prompt,
            provider: "udio",
            instrumental: input.instrumental,
          },
          costCents: 10,
        });
      } catch {
        results.push(this.stub(input));
      }
    }

    return results;
  }

  private stub(input: MusicGenerateInput): GenerationResult {
    const id = crypto.randomUUID();
    return {
      id,
      uri: `stub://audio-udio/${id}`,
      metadata: {
        prompt: input.prompt,
        stub: true,
        provider: "udio",
        instrumental: input.instrumental,
      },
      costCents: 10,
    };
  }
}
