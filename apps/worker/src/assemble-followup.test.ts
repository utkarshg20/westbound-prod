import { describe, expect, it, vi } from "vitest";

vi.mock("@westbound/platform", async (importOriginal) => ({ ...(await importOriginal<typeof import("@westbound/platform")>()) }));
const { isAssembleFollowUp } = await import("./handlers.js");

describe("assemble_video follow-up detection", () => {
  it("recognises the job queued for a run that was just created", () => {
    expect(isAssembleFollowUp({ channelSlug: "c", topic: "t", videoId: "v", runId: "r" })).toBe(true);
    expect(isAssembleFollowUp({ topic: "t", runId: "r" })).toBe(true);
  });
  it("does not treat a fresh request as a follow-up", () => {
    expect(isAssembleFollowUp({ channelSlug: "c", topic: "t" })).toBe(false);
    expect(isAssembleFollowUp({ proof14: true })).toBe(false);
  });
});
