import { describe, expect, it } from "vitest";
import {
  buildCreatomatePayload,
  introScript,
  resolveChannelSlug,
} from "./youtube-factory.js";

describe("resolveChannelSlug", () => {
  it("maps lofi alias to lofi_compounder", () => {
    expect(resolveChannelSlug("lofi")).toBe("lofi_compounder");
  });

  it("keeps canonical slugs", () => {
    expect(resolveChannelSlug("rain_rock")).toBe("rain_rock");
  });
});

describe("introScript", () => {
  it("includes duration", () => {
    expect(introScript("lofi_compounder", 60)).toContain("60 minutes");
  });
});

describe("buildCreatomatePayload", () => {
  it("embeds tracks and visual loop", () => {
    const payload = buildCreatomatePayload({
      channelSlug: "lofi_compounder",
      trackUris: ["r2://a.wav"],
      visualLoopUri: "r2://loop.mp4",
      introVoiceoverText: "Welcome",
      durationMinutes: 60,
    });
    expect(payload.modifications).toMatchObject({
      tracks: ["r2://a.wav"],
      visual_loop: "r2://loop.mp4",
    });
  });
});
