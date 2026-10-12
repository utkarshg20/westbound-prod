import { describe, expect, it } from "vitest";
import type { Signal } from "@westbound/platform";
import { rankBriefMatches, scoreBriefVariant } from "./sync-agents.js";
import { StubLlmClient } from "./llm.js";

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

describe("scoreBriefVariant", () => {
  it("returns zero-score discard on malformed JSON from LLM", async () => {
    class BadJsonLlm extends StubLlmClient {
      override async complete() {
        return {
          text: "not valid json {{{",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
        };
      }
    }
    const result = await scoreBriefVariant(new BadJsonLlm(), {}, {});
    expect(result.total).toBe(0);
    expect(result.discard).toBe(true);
    expect(result.passed).toBe(false);
  });
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
