import type { PublishInput, Publisher } from "./interfaces.js";
import { fetchProviderUri, guessContentType } from "@westbound/platform";

export type FetchLike = typeof fetch;

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`YouTube OAuth: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export class YouTubePublisher implements Publisher {
  readonly platform = "youtube";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly loadMedia: (uri: string) => Promise<Buffer> = fetchProviderUri
  ) {}

  /**
   * YouTube's resumable upload is two requests. The first only declares the video (metadata and size) and answers with an
   * upload URL in the Location header, with an empty body. The video itself is the second request, to that URL. This used to
   * send only the first, so a live run recorded a publish with no id and nothing on YouTube.
   */
  async publish(input: PublishInput): Promise<{ externalId: string; url?: string }> {
    const media = await this.loadMedia(input.mediaUri);
    if (!media.length) throw new Error(`YouTube upload: ${input.mediaUri} is empty`);
    const contentType = guessContentType(input.mediaUri, "video/mp4");
    const token = await getAccessToken(this.clientId, this.clientSecret, this.refreshToken);

    const init = await this.fetchImpl(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(media.length),
          "X-Upload-Content-Type": contentType,
        },
        body: JSON.stringify({
          snippet: { title: input.title, description: input.description, tags: input.tags },
          status: { privacyStatus: "private", publishAt: input.scheduledAt?.toISOString() },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!init.ok) throw new Error(`YouTube upload init ${init.status}: ${(await init.text()).slice(0, 300)}`);
    const sessionUrl = init.headers.get("location");
    if (!sessionUrl) throw new Error("YouTube upload init returned no upload URL");

    const done = await this.fetchImpl(sessionUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(media.length) },
      body: new Uint8Array(media),
      signal: AbortSignal.timeout(30 * 60_000),
    });
    const text = await done.text();
    if (!done.ok) throw new Error(`YouTube upload ${done.status}: ${text.slice(0, 300)}`);
    let id: string | undefined;
    try {
      id = (JSON.parse(text) as { id?: string }).id;
    } catch {
      /* handled below */
    }
    if (!id) throw new Error("YouTube upload finished but returned no video id");
    return { externalId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }
}

export class StubAwareYouTubePublisher implements Publisher {
  readonly platform = "youtube";
  private live: YouTubePublisher | null = null;

  constructor(clientId?: string, clientSecret?: string, refreshToken?: string) {
    if (clientId && clientSecret && refreshToken) {
      this.live = new YouTubePublisher(clientId, clientSecret, refreshToken);
    }
  }

  async publish(input: PublishInput): Promise<{ externalId: string; url?: string }> {
    if (this.live) return this.live.publish(input);
    const externalId = `yt_stub_${crypto.randomUUID().slice(0, 8)}`;
    return {
      externalId,
      url: `https://www.youtube.com/watch?v=${externalId}`,
    };
  }
}
