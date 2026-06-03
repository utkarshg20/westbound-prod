import type { Signal } from "@westbound/platform";
import { logger } from "@westbound/platform";
import type { LlmClient } from "./llm.js";
import { BriefScoreSchema, SunoPromptOutputSchema, TrackMetadataSchema } from "./schemas.js";

export interface SunoPromptOutput {
  prompt: string;
  negativePrompt: string;
  bpm: number;
  mood: string;
  genre: string;
  instrumental: boolean;
}

export async function signalToSunoPrompt(
  llm: LlmClient,
  signal: Signal,
  options?: { productionRunId?: string }
): Promise<SunoPromptOutput | null> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content:
          "You convert music licensing demand signals into Suno-ready prompts. Respect must_not rules in the brief. Respond with JSON only: prompt, negativePrompt, bpm, mood, genre, instrumental (boolean).",
      },
      {
        role: "user",
        content: JSON.stringify({
          mood: signal.mood,
          genre: signal.genre,
          bpm_min: signal.bpm_min,
          bpm_max: signal.bpm_max,
          raw: signal.raw_payload,
        }),
      },
    ],
    { temperature: 0.7, productionRunId: options?.productionRunId }
  );

  try {
    const parsed = SunoPromptOutputSchema.safeParse(JSON.parse(raw.text));
    if (parsed.success) return parsed.data;
  } catch {
    /* unparseable */
  }

  logger.warn("signalToSunoPrompt schema failure — skipping generation", {
    signalId: signal.id,
    productionRunId: options?.productionRunId,
  });
  return null;
}

export interface TrackMetadata {
  bpm: number;
  key: string;
  mood: string[];
  genre: string;
  soundsLike: string[];
  useCases: string[];
  description: string;
}

export async function tagTrackMetadata(
  llm: LlmClient,
  title: string,
  sunoPrompt: string,
  options?: { productionRunId?: string }
): Promise<TrackMetadata | null> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content:
          "Tag a production music track for sync libraries. JSON only: bpm, key, mood (array), genre, soundsLike (array), useCases (array), description.",
      },
      {
        role: "user",
        content: JSON.stringify({ title, sunoPrompt }),
      },
    ],
    { temperature: 0, productionRunId: options?.productionRunId }
  );

  try {
    const parsed = TrackMetadataSchema.safeParse(JSON.parse(raw.text));
    if (parsed.success) return parsed.data;
  } catch {
    /* unparseable */
  }

  logger.warn("tagTrackMetadata schema failure", {
    title,
    productionRunId: options?.productionRunId,
  });
  return null;
}

export interface BriefMatch {
  trackId: string;
  signalId: string;
  score: number;
  platform: string;
  signalIds?: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function genreMatches(tags: string[], signalGenre: string): boolean {
  const g = signalGenre.toLowerCase().trim();
  if (!g) return false;
  const exact = tags.some((t) => t.toLowerCase().trim() === g);
  if (exact) return true;
  const re = new RegExp(`\\b${escapeRegex(g)}\\b`, "i");
  return tags.some((t) => re.test(t));
}

function bpmOverlapScore(
  bpmMin: number | null,
  bpmMax: number | null,
  trackBpm: number
): number {
  if (bpmMin == null || bpmMax == null) return 0;
  if (trackBpm >= bpmMin && trackBpm <= bpmMax) return 0.3;
  const margin = 10;
  if (trackBpm >= bpmMin - margin && trackBpm <= bpmMax + margin) return 0.15;
  return 0;
}

const USE_CASE_KEYWORDS = [
  "documentary",
  "vlog",
  "trailer",
  "wedding",
  "commercial",
  "podcast",
] as const;

function useCaseBoost(
  briefDescription: string,
  useCases: string[]
): number {
  const lower = briefDescription.toLowerCase();
  let boost = 0;
  for (const kw of USE_CASE_KEYWORDS) {
    if (lower.includes(kw) && useCases.some((u) => u.toLowerCase().includes(kw))) {
      boost += 0.1;
    }
  }
  return Math.min(boost, 0.2);
}

export function rankBriefMatches(
  tracks: Array<{ id: string; mood_tags: string[]; metadata: Record<string, unknown> }>,
  signals: Signal[],
  threshold = 0.6
): BriefMatch[] {
  const byTrack = new Map<string, BriefMatch>();

  for (const signal of signals) {
    const signalMood = (signal.mood ?? "").toLowerCase().trim();
    const signalGenre = (signal.genre ?? "").toLowerCase().trim();
    const briefDesc = String(signal.raw_payload.brief_description ?? "");

    for (const track of tracks) {
      const tags = track.mood_tags.map((t) => t.toLowerCase().trim());
      let score = 0;

      if (signalMood && tags.includes(signalMood)) score += 0.35;
      else if (signalMood && tags.some((t) => t === signalMood)) score += 0.35;

      if (signalGenre && genreMatches(tags, signalGenre)) score += 0.2;

      const metaGenre = String(track.metadata.genre ?? "").toLowerCase();
      if (signalGenre && metaGenre === signalGenre) score += 0.15;

      const trackBpm = Number(track.metadata.bpm ?? 0);
      if (trackBpm > 0) {
        score += bpmOverlapScore(signal.bpm_min, signal.bpm_max, trackBpm);
      }

      const useCases = (track.metadata.useCases as string[] | undefined) ?? [];
      score += useCaseBoost(briefDesc, useCases);

      score = Math.min(score, 1);

      if (score >= threshold) {
        const existing = byTrack.get(track.id);
        if (!existing || existing.score < score) {
          byTrack.set(track.id, {
            trackId: track.id,
            signalId: signal.id,
            score,
            platform: String(signal.raw_payload.platform ?? "songtradr"),
            signalIds: existing?.signalIds
              ? [...new Set([...existing.signalIds, signal.id])]
              : [signal.id],
          });
        } else if (existing) {
          existing.signalIds = [...new Set([...(existing.signalIds ?? []), signal.id])];
        }
      }
    }
  }

  return [...byTrack.values()].sort((a, b) => b.score - a.score);
}

export interface BriefScoreResult {
  total: number;
  breakdown: {
    bpm: number;
    vocal: number;
    instruments: number;
    mood: number;
    length: number;
    avoidViolations: number;
  };
  passed: boolean;
  discard: boolean;
  holdForDan: boolean;
}

export async function scoreBriefVariant(
  llm: LlmClient,
  brief: Record<string, unknown>,
  variantMeta: Record<string, unknown>,
  options?: { productionRunId?: string }
): Promise<BriefScoreResult> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content: `Score this track variant against a sync brief on a 100-point rubric.
JSON only: total (0-100), breakdown { bpm, vocal, instruments, mood, length, avoidViolations } (each 0-max per category),
passed (boolean, true if total>=75), discard (boolean, true if total<75), holdForDan (boolean, true if 75-84).
Max per category: bpm 15, vocal 20, instruments 20, mood 25, length 10, avoidViolations 10.`,
      },
      {
        role: "user",
        content: JSON.stringify({ brief, variant: variantMeta }),
      },
    ],
    { temperature: 0, productionRunId: options?.productionRunId }
  );

  try {
    const parsed = BriefScoreSchema.safeParse(JSON.parse(raw.text));
    if (parsed.success) {
      const d = parsed.data;
      return {
        total: d.total,
        breakdown: d.breakdown,
        passed: d.total >= 85,
        discard: d.total < 75,
        holdForDan: d.total >= 75 && d.total < 85,
      };
    }
  } catch {
    /* fall through */
  }

  return {
    total: 0,
    breakdown: {
      bpm: 0,
      vocal: 0,
      instruments: 0,
      mood: 0,
      length: 0,
      avoidViolations: 0,
    },
    passed: false,
    discard: true,
    holdForDan: false,
  };
}
