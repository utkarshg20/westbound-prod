import { describe, expect, it, vi } from "vitest";

const token = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
vi.stubGlobal("fetch", token); // only the OAuth call in getAccessToken uses the global fetch

const { YouTubePublisher } = await import("./youtube.js");

const video = Buffer.from("not really a video");
const input = { title: "T", description: "D", mediaUri: "r2://b/master.mp4", tags: ["a"], scheduledAt: new Date("2026-12-01T15:00:00Z") };

function make(handlers: Array<(url: string, init: RequestInit) => Response>, media: Buffer = video) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handlers[calls.length - 1]!(url, init);
  }) as unknown as typeof fetch;
  return { publisher: new YouTubePublisher("id", "secret", "refresh", f, async () => media), calls };
}
const init = () => new Response("", { status: 200, headers: { location: "https://upload.example/session/abc" } });

describe("YouTubePublisher resumable upload", () => {
  it("declares the video, then sends its bytes to the upload URL, and returns the id YouTube answers with", async () => {
    const { publisher, calls } = make([init, () => new Response(JSON.stringify({ id: "vid123" }), { status: 200 })]);
    const out = await publisher.publish(input);
    expect(out).toEqual({ externalId: "vid123", url: "https://www.youtube.com/watch?v=vid123" });
    expect(calls).toHaveLength(2);
    const [first, second] = calls;
    expect(first!.url).toContain("uploadType=resumable");
    expect((first!.init.headers as Record<string, string>)["X-Upload-Content-Length"]).toBe(String(video.length));
    expect(JSON.parse(first!.init.body as string)).toMatchObject({ snippet: { title: "T" }, status: { privacyStatus: "private", publishAt: "2026-12-01T15:00:00.000Z" } });
    expect(second!.url).toBe("https://upload.example/session/abc");
    expect(second!.init.method).toBe("PUT");
    expect(Buffer.from(second!.init.body as Uint8Array).equals(video)).toBe(true);
  });

  it("fails, and says so, when the init answers no upload URL", async () => {
    const { publisher, calls } = make([() => new Response("", { status: 200 })]);
    await expect(publisher.publish(input)).rejects.toThrow("no upload URL");
    expect(calls).toHaveLength(1);
  });

  it("fails when the init is refused, and when the upload is refused or returns no id (a publish is never recorded without a video)", async () => {
    await expect(make([() => new Response("quota", { status: 403 })]).publisher.publish(input)).rejects.toThrow("init 403");
    await expect(make([init, () => new Response("boom", { status: 500 })]).publisher.publish(input)).rejects.toThrow("upload 500");
    await expect(make([init, () => new Response("{}", { status: 200 })]).publisher.publish(input)).rejects.toThrow("no video id");
    await expect(make([init, () => new Response("", { status: 200 })]).publisher.publish(input)).rejects.toThrow("no video id");
  });

  it("refuses an empty file before any request to YouTube", async () => {
    const { publisher, calls } = make([], Buffer.alloc(0));
    await expect(publisher.publish(input)).rejects.toThrow("is empty");
    expect(calls).toHaveLength(0);
  });
});
