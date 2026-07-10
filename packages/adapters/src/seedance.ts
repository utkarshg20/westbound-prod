import type {
  GenerationResult,
  VideoGenerateInput,
  VideoGenerator,
} from "./interfaces.js";
import { fetchHardened } from "./fetch-hardened.js";

/**
 * Seedance 2.0 Fast — default volume B-roll (~$0.09/sec).
 * Falls back to stub URI when API key absent or request fails.
 */
export class SeedanceVideoGenerator implements VideoGenerator {
  readonly name = "seedance";

  constructor(
    private readonly apiKey: string,
    private readonly apiBase = process.env.SEEDANCE_API_BASE ??
      "https://api.seedance.ai/v1"
  ) {}

  async generate(input: VideoGenerateInput): Promise<GenerationResult> {
    const durationSec = input.durationSec ?? 5;
    if (!this.apiKey || this.apiKey.startsWith("fake")) {
      return this.stub(input, durationSec);
    }
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
          duration_sec: durationSec,
          image_uri: input.imageUri,
          shot_type: input.shotType ?? "broll",
        }),
      });

      if (!res.ok) {
        return this.stub(input, durationSec);
      }

      const data = (await res.json()) as {
        id?: string;
        video_url?: string;
        url?: string;
      };
      const id = data.id ?? crypto.randomUUID();
      return {
        id,
        uri: data.video_url ?? data.url ?? `seedance://${id}`,
        metadata: {
          prompt: input.prompt,
          shotType: input.shotType,
          provider: "seedance",
        },
        costCents: Math.round(durationSec * 9),
      };
    } catch {
      return this.stub(input, durationSec);
    }
  }

  private stub(
    input: VideoGenerateInput,
    durationSec: number
  ): GenerationResult {
    const id = crypto.randomUUID();
    return {
      id,
      uri: `stub://video-seedance/${id}`,
      metadata: {
        prompt: input.prompt,
        shotType: input.shotType,
        stub: true,
        durationSec,
      },
      costCents: Math.round(durationSec * 9),
    };
  }
}
