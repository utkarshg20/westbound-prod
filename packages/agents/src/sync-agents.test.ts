import { describe, expect, it } from "vitest";
import type { Signal } from "@westbound/platform";
import { rankBriefMatches } from "./sync-agents.js";

const baseSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: "s1",
  source: "test",
  external_id: null,
  mood: "calm",
  genre: "rock",
  bpm_min: 80,
  bpm_max: 100,
  deadline: null,
  raw_payload: { brief_description: "documentary trailer" },
  processed_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe("rankBriefMatches", () => {
  it("does not match rock inside rocket via substring", () => {
    const tracks = [
      {
        id: "t1",
        mood_tags: ["rocket fuel pulse"],
        metadata: { genre: "electronic", bpm: 120, useCases: ["vlog"] },
      },
    ];
    const matches = rankBriefMatches(tracks, [baseSignal({ genre: "rock" })], 0.3);
    const rockMatch = matches.find((m) => m.trackId === "t1");
    expect(rockMatch?.score ?? 0).toBeLessThan(0.55);
  });

  it("boosts BPM overlap", () => {
    const tracks = [
      {
        id: "t2",
        mood_tags: ["calm"],
        metadata: { genre: "rock", bpm: 90, useCases: ["documentary"] },
      },
    ];
    const matches = rankBriefMatches(tracks, [baseSignal()], 0.5);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(0.5);
  });
});
