import { describe, expect, it } from "vitest";
import { assertVoicePublishAllowed, ComplianceError, countCitedSources } from "./compliance.js";

const voice = { kind: "voice", trailer_uploaded_at: "2026-01-01T00:00:00Z", publish_cadence: "5_per_week" } as const;

describe("voice-channel citations", () => {
  it("accepts the shape channel-factory actually builds when there are two sources", () => {
    expect(() => assertVoicePublishAllowed(voice, { citations_json: { sources: [{ title: "A" }, { title: "B" }] } })).not.toThrow();
    expect(() => assertVoicePublishAllowed(voice, { citations_json: { sources: ["https://a.example", "https://b.example"] } })).not.toThrow();
  });

  it("refuses the shape with no or one source (it used to refuse every real one, and pass any two keys)", () => {
    for (const citations_json of [{ sources: [] }, { sources: [{ title: "A" }] }, { a: 1, b: 2 }, { sources: "two" }, null]) {
      expect(() => assertVoicePublishAllowed(voice, { citations_json })).toThrow(ComplianceError);
    }
  });

  it("counts only non-empty sources", () => {
    expect(countCitedSources({ sources: ["", "  ", {}, null, "x", { u: 1 }] })).toBe(2);
    expect(countCitedSources(undefined)).toBe(0);
  });
});
