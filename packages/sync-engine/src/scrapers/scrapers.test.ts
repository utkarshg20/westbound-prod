import { describe, expect, it } from "vitest";
import {
  parseSongtradrBriefCsv,
  parseTikTokTrends,
  parseTunefindRows,
} from "./index.js";

describe("parseSongtradrBriefCsv", () => {
  it("parses header + rows with must_not lists", () => {
    const rows = [
      [
        "brief_id",
        "mood",
        "genre",
        "bpm_min",
        "bpm_max",
        "description",
        "must_not",
        "sounds_like",
      ],
      [
        "br_1",
        "tense",
        "cinematic",
        "80",
        "100",
        "Trailer underscore",
        "vocals;edm",
        "Zimmer;light",
      ],
    ];
    const signals = parseSongtradrBriefCsv(rows);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.external_id).toBe("br_1");
    expect(signals[0]!.bpm_min).toBe(80);
    expect(signals[0]!.raw_payload.must_not).toEqual(["vocals", "edm"]);
  });

  it("returns empty for header-only", () => {
    expect(parseSongtradrBriefCsv([["brief_id", "mood"]])).toEqual([]);
  });
});

describe("parseTunefindRows", () => {
  it("builds external ids from show names", () => {
    const signals = parseTunefindRows([
      { show: "The Bear", mood: "urgent", genre: "indie", bpm: 110 },
    ]);
    expect(signals[0]!.source).toBe("tunefind_placement");
    expect(signals[0]!.external_id).toContain("the_bear");
    expect(signals[0]!.bpm_min).toBe(100);
  });
});

describe("parseTikTokTrends", () => {
  it("defaults bpm range when missing", () => {
    const signals = parseTikTokTrends([
      { sound: "lofi study", mood: "calm", genre: "lofi" },
    ]);
    expect(signals[0]!.bpm_min).toBe(70);
    expect(signals[0]!.bpm_max).toBe(90);
  });
});
