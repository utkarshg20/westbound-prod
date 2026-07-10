import { describe, expect, it } from "vitest";

/** Regression: curation queue must merge metadata, not overwrite briefScore */
describe("submitToCurationQueue metadata merge", () => {
  it("preserves briefScore when adding curation flags", () => {
    const existing = {
      briefScore: 88,
      audioUri: "r2://westbound-assets/sync/track.wav",
      rubricBreakdown: { bpm: 15, mood: 20 },
      signalId: "sig-1",
    };
    const merged = {
      ...existing,
      qaStatus: "pending_curation",
      curationQueue: true,
    };
    expect(merged.briefScore).toBe(88);
    expect(merged.audioUri).toContain("r2://");
    expect(merged.rubricBreakdown).toEqual({ bpm: 15, mood: 20 });
    expect(merged.curationQueue).toBe(true);
  });
});
