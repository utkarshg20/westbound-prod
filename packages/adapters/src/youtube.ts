import type { PublishInput, Publisher } from "./interfaces.js";
import { fetchProviderUri, guessContentType } from "@westbound/platform";

export type FetchLike = typeof fetch;

/**
 * Thrown when the video bytes were sent (or may have been) and the outcome is not known: a connection reset or timeout after
 * the body went out, a 5xx, or "finished" with no id. The video may be on YouTube. The caller must not retry blindly.
 */
export class UploadOutcomeUnknown extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadOutcomeUnknown";
  }
}

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

    let done: Response;
    let text: string;
    try {
      // A Buffer is already a Uint8Array: no second copy of the file in memory.
      done = await this.fetchImpl(sessionUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType, "Content-Length": String(media.length) },
        body: media as unknown as NonNullable<RequestInit["body"]>,
        signal: AbortSignal.timeout(30 * 60_000),
      });
      text = await done.text();
    } catch (error) {
      throw new UploadOutcomeUnknown(`YouTube upload was interrupted after the video was sent (${String(error)}); it may be on the channel`);
    }
    // 4xx is YouTube refusing the video (nothing was stored). Anything else that is not success may have stored it.
    if (!done.ok) {
      const refused = done.status >= 400 && done.status < 500 && done.status !== 408 && done.status !== 429;
      const message = `YouTube upload ${done.status}: ${text.slice(0, 300)}`;
      throw refused ? new Error(message) : new UploadOutcomeUnknown(message);
    }
    let id: string | undefined;
    try {
      id = (JSON.parse(text) as { id?: string }).id;
    } catch {
      /* handled below */
    }
    if (!id) throw new UploadOutcomeUnknown("YouTube upload finished but returned no video id; check the channel before retrying");
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
    // A stub id looks like a published video to the pipeline, which would record it and move the run to dsp_live with nothing
    // on YouTube. Outside development, missing credentials are an error.
    if (process.env.NODE_ENV === "production") throw new Error("YouTube credentials are not configured; refusing to record a stub publish");
    const externalId = `yt_stub_${crypto.randomUUID().slice(0, 8)}`;
    return {
      externalId,
      url: `https://www.youtube.com/watch?v=${externalId}`,
    };
  }
}
