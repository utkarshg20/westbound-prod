import { fetchHardened } from "./fetch-hardened.js";
import type { PublishInput, Publisher } from "./interfaces.js";

export interface DistroKidReleaseInput extends PublishInput {
  isrc?: string;
  ddexAiDisclosure?: string;
  artistName?: string;
}

export class DistroKidPublisher implements Publisher {
  readonly platform = "distrokid";

  constructor(
    private readonly apiKey: string,
    private readonly apiBase = "https://api.distrokid.com/v1"
  ) {}

  async publish(input: DistroKidReleaseInput): Promise<{ externalId: string; url?: string }> {
    const res = await fetchHardened(`${this.apiBase}/releases`, {
      method: "POST",
      timeoutMs: 60_000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        artist: input.artistName ?? "Westbound Studios",
        audio_url: input.mediaUri,
        isrc: input.isrc,
        release_date: input.scheduledAt?.toISOString().slice(0, 10),
        ai_disclosure: input.ddexAiDisclosure ?? "AI-assisted, human-curated",
        description: input.description,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DistroKid publish failed ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as { id?: string; url?: string };
    return {
      externalId: data.id ?? `distrokid_${Date.now()}`,
      url: data.url,
    };
  }
}
