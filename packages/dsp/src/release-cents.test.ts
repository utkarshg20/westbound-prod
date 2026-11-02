import { describe, expect, it } from "vitest";
import { dollarsToCents } from "./release.js";

describe("dollarsToCents", () => {
  it("rounds half cents up instead of drifting with binary floats", () => {
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(8.325)).toBe(833);
    expect(dollarsToCents(2.675)).toBe(268);
  });
  it("is exact for ordinary amounts", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(9999999.99)).toBe(999999999);
  });
  it("does not choke on tiny amounts that print in exponent form", () => {
    expect(dollarsToCents(1e-7)).toBe(0);
  });
});
