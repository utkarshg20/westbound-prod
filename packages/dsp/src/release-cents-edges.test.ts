import { describe, expect, it } from "vitest";
import { dollarsToCents } from "./release.js";

describe("dollarsToCents edges", () => {
  it("rounds once, on the real value", () => {
    expect(dollarsToCents(1.0049996)).toBe(100);   // double rounding used to give 101
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(0.004999)).toBe(0);
  });
  it("refuses what is not money instead of writing NaN or a negative", () => {
    for (const bad of [NaN, Infinity, -1.005, -0.01]) expect(() => dollarsToCents(bad)).toThrow("not a valid dollar amount");
  });
  it("handles very small and large statement amounts", () => {
    expect(dollarsToCents(1e-7)).toBe(0);
    expect(dollarsToCents(9999999.99)).toBe(999999999);
  });
});
