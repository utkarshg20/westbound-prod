export type RoyaltyRow = { platform: string; amount: number; month: string; trackTitle?: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_AMOUNT = 10_000_000; // dollars per line: far above any real statement line, far below overflow

/** One CSV line into fields, honouring double-quoted fields ("Hello, World") and "" as an escaped quote. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { fields.push(field.trim()); field = ""; }
    else field += c;
  }
  fields.push(field.trim());
  return fields;
}

/**
 * Parse and validate the whole CSV before anything is written. A bad line used to become NaN, a negative or an
 * absurd amount in the revenue table, and a missing month silently became "now". Returns the rows or the first
 * problems found (with line numbers) so a person can fix the file and resubmit.
 */
export function parseRoyaltyCsv(csv: string): { rows: RoyaltyRow[]; errors: string[] } {
  const rows: RoyaltyRow[] = [];
  const errors: string[] = [];
  const lines = csv.replace(/\r/g, "").trim().split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const [platform, amount, month, trackTitle] = splitCsvLine(lines[i]);
    const n = Number(amount);
    if (!platform || platform.length > 60) errors.push(`line ${i + 1}: platform is missing or too long`);
    else if (amount === "" || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) errors.push(`line ${i + 1}: amount "${amount}" is not a valid dollar amount`);
    else if (!month || !MONTH.test(month)) errors.push(`line ${i + 1}: month "${month ?? ""}" must be YYYY-MM`);
    else rows.push({ platform, amount: n, month, trackTitle: trackTitle || undefined });
    if (errors.length >= 10) break;
  }
  return { rows, errors };
}
