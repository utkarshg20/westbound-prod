import { describe, expect, it } from "vitest";
import { isFinalFailure } from "./failure.js";

describe("isFinalFailure", () => {
  it("is false while attempts remain and true on the last one", () => {
    expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalFailure({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
  });
  it("treats a job with no retry setting as one attempt, and no job as not final", () => {
    expect(isFinalFailure({ attemptsMade: 1, opts: {} })).toBe(true);
    expect(isFinalFailure({ attemptsMade: 0, opts: {} })).toBe(false);
    expect(isFinalFailure(undefined)).toBe(false);
    expect(isFinalFailure(null)).toBe(false);
  });
});
