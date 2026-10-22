import { describe, expect, it } from "vitest";
import { parseRoyaltyCsv, splitCsvLine } from "./royalty-csv";

describe("quoted CSV fields", () => {
  it("keeps a comma inside quotes", () => {
    expect(splitCsvLine('spotify,12.5,2026-09,"Hello, World"')).toEqual(["spotify", "12.5", "2026-09", "Hello, World"]);
  });
  it("reads doubled quotes as one quote", () => {
    expect(splitCsvLine('a,1,2026-09,"She said ""hi"""')[3]).toBe('She said "hi"');
  });
  it("parses a whole file with a quoted title", () => {
    const { rows, errors } = parseRoyaltyCsv('platform,amount,month,track\nspotify,3.5,2026-09,"Hello, World"');
    expect(errors).toEqual([]);
    expect(rows[0].trackTitle).toBe("Hello, World");
  });
  it("still trims plain fields", () => {
    expect(splitCsvLine(" apple , 2 , 2026-10 , ")).toEqual(["apple", "2", "2026-10", ""]);
  });
});
