import type { PublishInput, Publisher } from "./interfaces.js";
import { apiPost } from "./http.js";

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    private readonly refreshToken: string
  ) {}

  async publish(input: PublishInput): Promise<{ externalId: string; url?: string }> {
    const token = await getAccessToken(
      this.clientId,
      this.clientSecret,
      this.refreshToken
    );

    const meta = await apiPost<{ id: string }>(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
        },
        status: {
          privacyStatus: "private",
          publishAt: input.scheduledAt?.toISOString(),
        },
      },
      { Authorization: `Bearer ${token}` }
    );

    return {
      externalId: meta.id,
      url: `https://www.youtube.com/watch?v=${meta.id}`,
    };
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
