import type { Signal } from "@westbound/platform";
import type { LlmClient } from "./llm.js";

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
  signal: Signal
): Promise<SunoPromptOutput> {
  const raw = await llm.complete([
    {
      role: "system",
      content:
        "You convert music licensing demand signals into Suno-ready prompts. Respond with JSON only: prompt, negativePrompt, bpm, mood, genre, instrumental (boolean).",
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
  ]);

  try {
    return JSON.parse(raw) as SunoPromptOutput;
  } catch {
    return {
      prompt: `Instrumental ${signal.genre ?? "ambient"} track, ${signal.mood ?? "calm"}, ${signal.bpm_min ?? 90} BPM`,
      negativePrompt: "vocals, lyrics, clipping",
      bpm: signal.bpm_min ?? 90,
      mood: signal.mood ?? "calm",
      genre: signal.genre ?? "ambient",
      instrumental: true,
    };
  }
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
  sunoPrompt: string
): Promise<TrackMetadata> {
  const raw = await llm.complete([
    {
      role: "system",
      content:
        "Tag a production music track for sync libraries. JSON only: bpm, key, mood (array), genre, soundsLike (array), useCases (array), description.",
    },
    {
      role: "user",
      content: JSON.stringify({ title, sunoPrompt }),
    },
  ]);

  try {
    return JSON.parse(raw) as TrackMetadata;
  } catch {
    return {
      bpm: 90,
      key: "Am",
      mood: ["calm"],
      genre: "ambient",
      soundsLike: [],
      useCases: ["documentary", "vlog"],
      description: title,
    };
  }
}

export interface BriefMatch {
  trackId: string;
  signalId: string;
  score: number;
  platform: string;
}

export function rankBriefMatches(
  tracks: Array<{ id: string; mood_tags: string[]; metadata: Record<string, unknown> }>,
  signals: Signal[],
  threshold = 0.6
): BriefMatch[] {
  const matches: BriefMatch[] = [];

  for (const signal of signals) {
    const signalMood = (signal.mood ?? "").toLowerCase();
    const signalGenre = (signal.genre ?? "").toLowerCase();

    for (const track of tracks) {
      const tags = track.mood_tags.map((t) => t.toLowerCase());
      let score = 0;
      if (signalMood && tags.some((t) => t.includes(signalMood) || signalMood.includes(t))) {
        score += 0.5;
      }
      if (signalGenre && tags.some((t) => t.includes(signalGenre))) {
        score += 0.3;
      }
      const metaGenre = String(track.metadata.genre ?? "").toLowerCase();
      if (signalGenre && metaGenre.includes(signalGenre)) score += 0.2;

      if (score >= threshold) {
        matches.push({
          trackId: track.id,
          signalId: signal.id,
          score: Math.min(score, 1),
          platform: String(signal.raw_payload.platform ?? "songtradr"),
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
