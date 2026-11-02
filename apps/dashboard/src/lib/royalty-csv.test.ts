import { describe, expect, it } from "vitest";
import { parseRoyaltyCsv } from "./royalty-csv";

const HEAD = "platform,amount,month,track\n";

describe("parseRoyaltyCsv", () => {
  it("reads good lines, including a missing track title and Windows line endings", () => {
    const { rows, errors } = parseRoyaltyCsv(`${HEAD}spotify,12.34,2026-09,Window at Six\r\napple,0,2026-10,\r\n`);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { platform: "spotify", amount: 12.34, month: "2026-09", trackTitle: "Window at Six" },
      { platform: "apple", amount: 0, month: "2026-10", trackTitle: undefined },
    ]);
  });

  it("rejects NaN, negative, absurd and empty amounts instead of storing them", () => {
    for (const amount of ["abc", "-5", "1e308", "", "99999999"]) {
      const { rows, errors } = parseRoyaltyCsv(`${HEAD}spotify,${amount},2026-09,t`);
      expect(rows).toEqual([]);
      expect(errors[0]).toMatch(/line 2: amount/);
    }
  });

  it("requires a real YYYY-MM month rather than quietly using today's", () => {
    for (const month of ["", "2026-13", "2026-9", "Sept 2026", "2026-00"]) {
      expect(parseRoyaltyCsv(`${HEAD}spotify,1,${month},t`).errors[0]).toMatch(/line 2: month/);
    }
    expect(parseRoyaltyCsv(`${HEAD}spotify,1`).errors[0]).toMatch(/month/);
  });

  it("reports the line number and stops collecting after ten problems", () => {
    const bad = Array.from({ length: 30 }, () => "x,nope,2026-09,t").join("\n");
    const { errors } = parseRoyaltyCsv(HEAD + bad);
    expect(errors).toHaveLength(10);
    expect(errors[9]).toMatch(/line 11/);
  });

  it("one bad line makes the whole file invalid so nothing partial is imported", () => {
    const { rows, errors } = parseRoyaltyCsv(`${HEAD}spotify,1,2026-09,t\nspotify,bad,2026-09,t`);
    expect(errors).toHaveLength(1);
    expect(rows).toHaveLength(1); // the route refuses on any error, so this partial list is never written
  });
});
