import { describe, expect, it } from "vitest";
import {
  assertVoicePublishAllowed,
  ComplianceError,
  maxVideosPerWeek,
} from "./compliance.js";

describe("assertVoicePublishAllowed", () => {
  it("allows music channels without trailer", () => {
    expect(() =>
      assertVoicePublishAllowed(
        {
          kind: "music",
          trailer_uploaded_at: null,
          publish_cadence: "5_per_week",
        },
        { citations_json: null }
      )
    ).not.toThrow();
  });

  it("requires trailer for voice channels", () => {
    expect(() =>
      assertVoicePublishAllowed(
        {
          kind: "voice",
          trailer_uploaded_at: null,
          publish_cadence: "5_per_week",
        },
        { citations_json: { a: 1, b: 2 } }
      )
    ).toThrow(ComplianceError);
  });

  it("requires citations for voice channels", () => {
    expect(() =>
      assertVoicePublishAllowed(
        {
          kind: "voice",
          trailer_uploaded_at: new Date().toISOString(),
          publish_cadence: "5_per_week",
        },
        { citations_json: { only: 1 } }
      )
    ).toThrow(ComplianceError);
  });
});

describe("maxVideosPerWeek", () => {
  it("maps cadence enums", () => {
    expect(maxVideosPerWeek("daily")).toBe(7);
    expect(maxVideosPerWeek("5_per_week")).toBe(5);
    expect(maxVideosPerWeek("4_per_week")).toBe(4);
    expect(maxVideosPerWeek("unknown")).toBe(5);
  });
});
