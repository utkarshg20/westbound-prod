import { createSupabaseAdmin, type Signal } from "@westbound/platform";

export interface RawSignalInput {
  source: string;
  external_id?: string;
  mood?: string;
  bpm_min?: number;
  bpm_max?: number;
  genre?: string;
  deadline?: string;
  raw_payload?: Record<string, unknown>;
}

/** Ingest demand signals — extend with Songtradr/Tunefind/TikTok scrapers */
export async function ingestSignals(
  inputs: RawSignalInput[]
): Promise<Signal[]> {
  const db = createSupabaseAdmin();
  const rows = inputs.map((s) => ({
    source: s.source,
    external_id: s.external_id ?? null,
    mood: s.mood ?? null,
    bpm_min: s.bpm_min ?? null,
    bpm_max: s.bpm_max ?? null,
    genre: s.genre ?? null,
    deadline: s.deadline ?? null,
    raw_payload: s.raw_payload ?? {},
  }));

  const { data, error } = await db.from("signals").insert(rows).select();
  if (error) throw error;
  return data as Signal[];
}

export async function ingestDailySignals(): Promise<number> {
  if (process.env.SIGNAL_CSV_PATH) {
    const { importSignalsFromCsv } = await import("./signal-import.js");
    const imported = await importSignalsFromCsv(process.env.SIGNAL_CSV_PATH);
    return imported.length;
  }

  const samples: RawSignalInput[] = [
    {
      source: "songtradr_brief",
      external_id: `brief_${Date.now()}`,
      mood: "tense",
      genre: "cinematic",
      bpm_min: 80,
      bpm_max: 100,
      raw_payload: { platform: "songtradr", disclosure: "AI-assisted, human-curated" },
    },
    {
      source: "tiktok_trend",
      mood: "uplifting",
      genre: "lofi",
      bpm_min: 70,
      bpm_max: 90,
      raw_payload: { platform: "pond5" },
    },
    {
      source: "tunefind_placement",
      mood: "melancholic",
      genre: "indie",
      bpm_min: 90,
      bpm_max: 110,
      raw_payload: { platform: "audiojungle" },
    },
  ];
  const created = await ingestSignals(samples);
  return created.length;
}
