import type { PublishInput, Publisher } from "./interfaces.js";

/** Songtradr upload — extend with official API when credentials available */
export class SongtradrPublisher implements Publisher {
  readonly platform = "songtradr";

  constructor(private readonly apiKey?: string) {}

  async publish(input: PublishInput): Promise<{ externalId: string; url?: string }> {
    if (!this.apiKey) {
      const externalId = `songtradr_stub_${crypto.randomUUID().slice(0, 8)}`;
      return { externalId, url: undefined };
    }

    const res = await fetch("https://api.songtradr.com/v1/tracks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        audio_url: input.mediaUri,
        tags: input.tags,
        disclosure: "AI-assisted, human-curated",
      }),
    });

    if (!res.ok) throw new Error(`Songtradr: ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return { externalId: data.id };
  }
}

/**
 * Pond5 rejects AI music (vendor-verification NO).
 * Fail closed so multi-route never silently "succeeds".
 */
export class Pond5Publisher implements Publisher {
  readonly platform = "pond5";

  async publish(_input: PublishInput): Promise<{ externalId: string; url?: string }> {
    throw new Error(
      "Pond5 rejects AI music — do not submit. Use Songtradr / DistroKid instead."
    );
  }
}
