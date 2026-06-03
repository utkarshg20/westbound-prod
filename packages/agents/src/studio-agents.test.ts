import { describe, expect, it } from "vitest";
import { StubLlmClient } from "./llm.js";
import { checkContinuity } from "./studio-agents.js";

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
