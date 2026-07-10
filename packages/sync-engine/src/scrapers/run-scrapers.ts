import { readFileSync } from "node:fs";
import {
  parseRssTitlesToTrends,
  parseSongtradrBriefCsv,
  parseTunefindRows,
  parseTikTokTrends,
} from "./index.js";
import type { RawSignalInput } from "../signals.js";

export async function scrapeSongtradrBriefs(
  csvPath?: string
): Promise<RawSignalInput[]> {
  const path = csvPath ?? process.env.SONGTRADR_BRIEFS_CSV;
  if (!path) return [];

  const text = readFileSync(path, "utf8");
  const rows = text
    .trim()
    .split("\n")
    .map((line) => {
      // Simple CSV split that respects quoted commas lightly
      const cells: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (ch === "," && !inQuotes) {
          cells.push(cur.trim());
          cur = "";
          continue;
        }
        cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
  return parseSongtradrBriefCsv(rows);
}

export async function scrapeTunefindRecent(): Promise<RawSignalInput[]> {
  const feedUrl = process.env.TUNEFIND_FEED_URL;
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      const titles: string[] = [];
      const re = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) && titles.length < 8) {
        const t = m[1]?.trim();
        if (t && !/tunefind/i.test(t)) titles.push(t);
      }
      if (titles.length) {
        return parseTunefindRows(
          titles.map((show) => ({
            show,
            mood: "tense",
            genre: "cinematic",
            bpm: 95,
          }))
        );
      }
    } catch {
      /* fall through to fixtures */
    }
  }

  return parseTunefindRows([
    { show: "Yellowstone S5", mood: "tense", genre: "americana", bpm: 95 },
    { show: "The Bear S3", mood: "urgent", genre: "indie", bpm: 110 },
  ]);
}

export async function scrapeTikTokTrending(): Promise<RawSignalInput[]> {
  const feedUrl = process.env.TIKTOK_TREND_FEED_URL;
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      const titles: string[] = [];
      const re = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) && titles.length < 8) {
        const t = m[1]?.trim();
        if (t) titles.push(t);
      }
      if (titles.length) return parseRssTitlesToTrends(titles);
    } catch {
      /* fall through */
    }
  }

  return parseTikTokTrends([
    { sound: "lofi study beats", mood: "calm", genre: "lofi", bpm: 80 },
    { sound: "cinematic trailer pulse", mood: "epic", genre: "cinematic", bpm: 100 },
  ]);
}

export async function scrapeAllSignalSources(): Promise<RawSignalInput[]> {
  const [songtradr, tunefind, tiktok] = await Promise.all([
    scrapeSongtradrBriefs(),
    scrapeTunefindRecent(),
    scrapeTikTokTrending(),
  ]);
  return [...songtradr, ...tunefind, ...tiktok];
}
