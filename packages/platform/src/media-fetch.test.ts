import { describe, expect, it } from "vitest";
import { fetchProviderUri, guessContentType } from "./media-fetch.js";

describe("fetchProviderUri", () => {
  it("returns stub buffer for stub URIs", async () => {
    const buf = await fetchProviderUri("stub://suno/track-1.wav");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString()).toContain("stub");
  });

  it("returns stub buffer for local URIs", async () => {
    const buf = await fetchProviderUri("local://studio/sammy/v1/test.wav");
    expect(buf.length).toBeGreaterThan(0);
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
