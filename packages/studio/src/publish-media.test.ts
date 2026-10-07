import { describe, expect, it } from "vitest";
import * as publishMedia from "./publish-media.js";

const { resolvePublishMediaUri } = publishMedia;
// findPublishMediaUri is new on this branch (shared with the dashboard approval route).
const findPublishMediaUri = (metadata: Record<string, unknown> | null | undefined) => {
  const fn = (publishMedia as Record<string, unknown>).findPublishMediaUri;
  if (typeof fn !== "function") expect.fail("findPublishMediaUri is not exported");
  return (fn as (m: typeof metadata) => string | null)(metadata);
};

describe("resolvePublishMediaUri (S3 master hand-off)", () => {
  it("prefers resolveMasterUri over episodeVideoUri", () => {
    expect(
      resolvePublishMediaUri({
        resolveMasterUri: "r2://bucket/master.mov",
        episodeVideoUri: "r2://bucket/episode.mp4",
      })
    ).toBe("r2://bucket/master.mov");
  });

  it("falls back to episodeVideoUri", () => {
    expect(
      resolvePublishMediaUri({ episodeVideoUri: "r2://bucket/episode.mp4" })
    ).toBe("r2://bucket/episode.mp4");
  });

  it("throws when neither URI is present", () => {
    expect(() => resolvePublishMediaUri({})).toThrow(/resolveMasterUri/);
  });

  it.each([
    ["blank strings", { resolveMasterUri: "   ", episodeVideoUri: "" }],
    ["a non-string master", { resolveMasterUri: { uri: "r2://x" } }],
    ["a numeric episode video", { episodeVideoUri: 42 }],
    ["null values", { resolveMasterUri: null, episodeVideoUri: null }],
  ])("throws for %s instead of publishing a junk URI", (_label, metadata) => {
    expect(() => resolvePublishMediaUri(metadata)).toThrow(/resolveMasterUri/);
  });

  it("skips a blank master and uses the episode video", () => {
    expect(
      resolvePublishMediaUri({ resolveMasterUri: " ", episodeVideoUri: "r2://bucket/episode.mp4" })
    ).toBe("r2://bucket/episode.mp4");
  });
});

describe("findPublishMediaUri (approval gate, non-throwing)", () => {
  it("returns the same choice as resolvePublishMediaUri", () => {
    expect(
      findPublishMediaUri({ resolveMasterUri: "r2://m.mov", episodeVideoUri: "r2://e.mp4" })
    ).toBe("r2://m.mov");
    expect(findPublishMediaUri({ episodeVideoUri: " r2://e.mp4 " })).toBe("r2://e.mp4");
  });

  it("returns null when the run has no usable media", () => {
    expect(findPublishMediaUri({})).toBeNull();
    expect(findPublishMediaUri(null)).toBeNull();
    expect(findPublishMediaUri({ resolveMasterUri: "", episodeVideoUri: 7 })).toBeNull();
  });
});
