import { describe, expect, it } from "vitest";
import { StubLlmClient } from "./llm.js";
import { checkContinuity, planShots } from "./studio-agents.js";

describe("planShots", () => {
  it("returns default shot plan on malformed JSON from LLM", async () => {
    class BadJsonLlm extends StubLlmClient {
      override async complete() {
        return {
          text: "not valid json {{{",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
        };
      }
    }
    const result = await planShots(new BadJsonLlm(), "test script");
    expect(Array.isArray(result.shots)).toBe(true);
    expect(result.shots.length).toBeGreaterThan(0);
  });
});

describe("checkContinuity", () => {
  it("fails closed on malformed JSON from stub", async () => {
    class BadJsonLlm extends StubLlmClient {
      override async complete() {
        return {
          text: "not valid json {{{",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
        };
      }
    }
    const result = await checkContinuity(
      new BadJsonLlm(),
      "test script",
      [],
      ["canon"],
      { productionRunId: "test-run" }
    );
    expect(result.passed).toBe(false);
    expect(result.flags).toContain("llm_response_unparseable");
  });
});
