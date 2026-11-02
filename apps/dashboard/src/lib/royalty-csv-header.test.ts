import { describe, expect, it } from "vitest";
import { parseRoyaltyCsv } from "./royalty-csv";
import { reviewerAllowed } from "./reviewer";
import { afterEach, vi } from "vitest";

describe("royalty CSV header detection", () => {
  it("a file without a header keeps its first row", () => {
    const { rows, errors } = parseRoyaltyCsv("spotify,12.5,2026-09,Song\napple,3,2026-09,Song");
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.platform)).toEqual(["spotify", "apple"]);
  });
  it("a file with a header skips it, whatever the column names", () => {
    expect(parseRoyaltyCsv("platform,amount,month,track\nspotify,1,2026-09,").rows).toHaveLength(1);
    expect(parseRoyaltyCsv("Service,Dollars,Period\nspotify,1,2026-09").rows).toHaveLength(1);
  });
});

describe("reviewer email comparison", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is case-insensitive and ignores surrounding spaces", () => {
    vi.stubEnv("REVIEWER_EMAIL", " Dan@Example.test ");
    const req = (email: string) => new Request("https://x.test", { method: "POST", headers: { "x-session-email": email } });
    expect(reviewerAllowed(req("dan@example.test"), "hero_publish")).toBe(true);
    expect(reviewerAllowed(req("DAN@EXAMPLE.TEST"), "hero_publish")).toBe(true);
    expect(reviewerAllowed(req("other@example.test"), "hero_publish")).toBe(false);
  });
});
