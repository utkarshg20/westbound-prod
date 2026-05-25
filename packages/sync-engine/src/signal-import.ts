import { createSupabaseAdmin, type Signal } from "@westbound/platform";
import { readFile } from "node:fs/promises";

export interface CsvSignalRow {
  source: string;
  mood?: string;
  genre?: string;
  bpm_min?: number;
  bpm_max?: number;
  platform?: string;
  external_id?: string;
}

/** Parse simple CSV: source,mood,genre,bpm_min,bpm_max,platform */
export function parseSignalCsv(content: string): CsvSignalRow[] {
  const lines = content.trim().split("\n");
  const header = lines[0]?.split(",").map((h) => h.trim().toLowerCase()) ?? [];
  const rows: CsvSignalRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols[0]) continue;
    const row: Record<string, string | number> = {};
    header.forEach((h, idx) => {
      const v = cols[idx];
      if (!v) return;
      if (h === "bpm_min" || h === "bpm_max") row[h] = Number(v);
      else row[h] = v;
    });
    rows.push({
      source: String(row.source ?? cols[0]),
      mood: row.mood as string | undefined,
      genre: row.genre as string | undefined,
      bpm_min: row.bpm_min as number | undefined,
      bpm_max: row.bpm_max as number | undefined,
      platform: row.platform as string | undefined,
      external_id: row.external_id as string | undefined,
    });
  }
  return rows;
}

export async function importSignalsFromCsv(filePath: string): Promise<Signal[]> {
  const content = await readFile(filePath, "utf-8");
  const parsed = parseSignalCsv(content);
  const db = createSupabaseAdmin();
  const inserts = parsed.map((s) => ({
    source: s.source,
    external_id: s.external_id ?? null,
    mood: s.mood ?? null,
    genre: s.genre ?? null,
    bpm_min: s.bpm_min ?? null,
    bpm_max: s.bpm_max ?? null,
    raw_payload: {
      platform: s.platform ?? "songtradr",
      disclosure: "AI-assisted, human-curated",
      importedFrom: filePath,
    },
  }));
  const { data, error } = await db.from("signals").insert(inserts).select();
  if (error) throw error;
  return data as Signal[];
}
