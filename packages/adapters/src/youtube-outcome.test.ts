import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })));
const { StubAwareYouTubePublisher, UploadOutcomeUnknown, YouTubePublisher } = await import("./youtube.js");

const video = Buffer.from("video bytes");
const input = { title: "T", description: "D", mediaUri: "r2://b/m.mp4" };
const init = () => new Response("", { status: 200, headers: { location: "https://upload.example/s" } });

function make(put: () => Response | Promise<Response>) {
  const f = (async (url: string) => (url.includes("uploadType") ? init() : put())) as unknown as typeof fetch;
  return new YouTubePublisher("id", "secret", "refresh", f, async () => video);
}

afterEach(() => vi.unstubAllEnvs());

describe("upload outcomes the caller must not blindly retry", () => {
  it("a connection error after the bytes were sent is outcome-unknown", async () => {
    const err = await make(() => { throw new Error("socket hang up"); }).publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(UploadOutcomeUnknown);
    expect(err.message).toContain("may be on the channel");
  });
  it("a 5xx, a timeout status and 'finished with no id' are outcome-unknown", async () => {
    for (const res of [new Response("oops", { status: 503 }), new Response("slow", { status: 408 }), new Response("{}", { status: 200 })]) {
      expect(await make(() => res).publish(input).catch((e) => e)).toBeInstanceOf(UploadOutcomeUnknown);
    }
  });
  it("a 4xx refusal is a plain error: nothing was stored, so a retry is safe", async () => {
    const err = await make(() => new Response("bad video", { status: 400 })).publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UploadOutcomeUnknown);
  });
  it("without credentials, production refuses instead of recording a stub publish; development still stubs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(new StubAwareYouTubePublisher().publish(input)).rejects.toThrow("credentials are not configured");
    vi.stubEnv("NODE_ENV", "development");
    expect((await new StubAwareYouTubePublisher().publish(input)).externalId).toMatch(/^yt_stub_/);
  });
});
