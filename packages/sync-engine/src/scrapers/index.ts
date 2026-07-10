import type { RawSignalInput } from "../signals.js";

/** Parse Songtradr brief CSV export: mood,genre,bpm_min,bpm_max,description,must_not */
export function parseSongtradrBriefCsv(rows: string[][]): RawSignalInput[] {
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.toLowerCase().trim());
  const idx = (name: string) => header.indexOf(name);

  return rows
    .slice(1)
    .filter((row) => row.some((c) => c.trim().length > 0))
    .map((row, i) => {
      const get = (name: string) => {
        const iCol = idx(name);
        return iCol >= 0 ? (row[iCol]?.trim() ?? "") : "";
      };
      const externalId = get("brief_id") || get("id") || `songtradr_${i}`;
      const bpmMin = Number(get("bpm_min"));
      const bpmMax = Number(get("bpm_max"));
      return {
        source: "songtradr_brief",
        external_id: externalId,
        mood: get("mood") || undefined,
        genre: get("genre") || undefined,
        bpm_min: Number.isFinite(bpmMin) && bpmMin > 0 ? bpmMin : undefined,
        bpm_max: Number.isFinite(bpmMax) && bpmMax > 0 ? bpmMax : undefined,
        raw_payload: {
          platform: "songtradr",
          brief_description: get("description") || get("brief_description"),
          must_not: get("must_not")
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean),
          sounds_like: get("sounds_like")
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
    });
}

/** Tunefind-style placement signals from structured rows */
export function parseTunefindRows(
  rows: Array<{ show: string; mood: string; genre: string; bpm?: number }>
): RawSignalInput[] {
  return rows.map((r, i) => ({
    source: "tunefind_placement",
    external_id: `tunefind_${r.show}_${i}`.replace(/\s+/g, "_").toLowerCase(),
    mood: r.mood,
    genre: r.genre,
    bpm_min: r.bpm ? r.bpm - 10 : undefined,
    bpm_max: r.bpm ? r.bpm + 10 : undefined,
    raw_payload: {
      platform: "songtradr",
      brief_description: `Recent placement style: ${r.show}`,
      reference_show: r.show,
    },
  }));
}

/** TikTok trending sound signals */
export function parseTikTokTrends(
  trends: Array<{ sound: string; mood: string; genre: string; bpm?: number }>
): RawSignalInput[] {
  return trends.map((t, i) => ({
    source: "tiktok_trend",
    external_id: `tiktok_${i}_${t.sound.slice(0, 20).replace(/\s+/g, "_")}`,
    mood: t.mood,
    genre: t.genre,
    bpm_min: t.bpm ? t.bpm - 5 : 70,
    bpm_max: t.bpm ? t.bpm + 5 : 90,
    raw_payload: {
      platform: "songtradr",
      brief_description: `Trending: ${t.sound}`,
      trend_sound: t.sound,
    },
  }));
}

/** Parse a simple RSS/Atom title list into TikTok-style trend signals */
export function parseRssTitlesToTrends(
  titles: string[],
  defaults?: { mood?: string; genre?: string }
): RawSignalInput[] {
  return parseTikTokTrends(
    titles.slice(0, 10).map((sound) => ({
      sound,
      mood: defaults?.mood ?? "uplifting",
      genre: defaults?.genre ?? "lofi",
    }))
  );
}
