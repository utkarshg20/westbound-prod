import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStorage } from "./r2.js";
import { fetchAndUploadToR2, fetchProviderUri, guessContentType } from "./media-fetch.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("fetchProviderUri", () => {
  it("refuses a missing provider result", async () => {
    await expect(fetchProviderUri("")).rejects.toThrow("Missing media URI");
  });
  it("returns stub buffer for stub URIs", async () => {
    const buf = await fetchProviderUri("stub://suno/track-1.wav");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString()).toContain("stub");
  });

  it("returns stub buffer for local URIs", async () => {
    const buf = await fetchProviderUri("local://studio/sammy/v1/test.wav");
    expect(buf.length).toBeGreaterThan(0);
  });

  it("does not turn an R2 download failure into media bytes", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "test");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test");
    vi.stubEnv("R2_BUCKET_NAME", "westbound-assets");
    vi.spyOn(AssetStorage, "fromEnv").mockRejectedValue(new Error("storage unavailable"));
    await expect(fetchProviderUri("r2://westbound-assets/masters/teaser1.mov"))
      .rejects.toThrow("storage unavailable");
  });

  it("does not claim a local artifact after a real-media upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("media")));
    vi.spyOn(AssetStorage, "fromEnv").mockRejectedValue(new Error("upload unavailable"));
    await expect(fetchAndUploadToR2("https://cdn.example.com/master.mov", {
      projectSlug: "studio", entitySlug: "sammy", contentType: "video/quicktime",
    })).rejects.toThrow("upload unavailable");
  });

  it("rejects the dashboard demo URI as a real media source", async () => {
    await expect(fetchProviderUri("demo://master/run/master.mov"))
      .rejects.toThrow("Unsupported media URI");
  });

  it("propagates a rejected real upload after storage initializes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("media")));
    vi.spyOn(AssetStorage, "fromEnv").mockResolvedValue({
      upload: vi.fn().mockRejectedValue(new Error("write failed")),
    } as unknown as AssetStorage);
    await expect(fetchAndUploadToR2("https://cdn.example.com/master.mov", {
      projectSlug: "studio", entitySlug: "sammy", contentType: "video/quicktime",
    })).rejects.toThrow("write failed");
  });

  it("preserves the explicit stub fallback after an asynchronous upload failure", async () => {
    vi.spyOn(AssetStorage, "fromEnv").mockResolvedValue({
      upload: vi.fn().mockRejectedValue(new Error("write failed")),
    } as unknown as AssetStorage);
    await expect(fetchAndUploadToR2("stub://studio/sammy/master.mov", {
      projectSlug: "studio", entitySlug: "sammy", contentType: "video/quicktime", filename: "master.mov",
    })).resolves.toBe("local://studio/sammy/v1/master.mov");
  });
});

describe("guessContentType", () => {
  it("detects wav from extension", () => {
    expect(guessContentType("https://cdn.example.com/track.wav", "audio/mpeg")).toBe(
      "audio/wav"
    );
  });

  it("falls back to default", () => {
    expect(guessContentType("stub://unknown", "video/mp4")).toBe("video/mp4");
  });
});
