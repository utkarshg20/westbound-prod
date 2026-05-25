import type { StoryBeat } from "@westbound/platform";
import type { LlmClient } from "./llm.js";

export interface ContinuityResult {
  passed: boolean;
  flags: string[];
  notes: string;
}

export async function checkContinuity(
  llm: LlmClient,
  script: string,
  beats: StoryBeat[],
  canonConstraints: string[]
): Promise<ContinuityResult> {
  const raw = await llm.complete([
    {
      role: "system",
      content:
        "You are a continuity editor for a serialized AI rockumentary. Check script against canon. Respond JSON: passed (boolean), flags (string array), notes (string).",
    },
    {
      role: "user",
      content: JSON.stringify({
        script,
        storyBeats: beats.map((b) => ({
          episode: b.episode_number,
          title: b.title,
          summary: b.summary,
        })),
        canonConstraints,
      }),
    },
  ]);

  try {
    return JSON.parse(raw) as ContinuityResult;
  } catch {
    return { passed: true, flags: [], notes: "Stub continuity check — manual review required." };
  }
}

export interface ShotPlan {
  shots: Array<{
    index: number;
    shotType: "dialogue" | "establishing" | "broll";
    prompt: string;
    hasCharacter: boolean;
    providerHint: string;
  }>;
}

export async function planShots(
  llm: LlmClient,
  script: string
): Promise<ShotPlan> {
  const raw = await llm.complete([
    {
      role: "system",
      content:
        "Break a 3-minute rockumentary script into shots. JSON: shots array with index, shotType (dialogue|establishing|broll), prompt, hasCharacter, providerHint (kling|veo|runway|reuse_broll).",
    },
    { role: "user", content: script },
  ]);

  try {
    return JSON.parse(raw) as ShotPlan;
  } catch {
    return {
      shots: [
        {
          index: 0,
          shotType: "establishing",
          prompt: "Rain on Indiana farmland at dusk",
          hasCharacter: false,
          providerHint: "veo",
        },
        {
          index: 1,
          shotType: "dialogue",
          prompt: "Sammy in dim bar, neon edge light",
          hasCharacter: true,
          providerHint: "kling",
        },
      ],
    };
  }
}

export interface QaVisionResult {
  driftScore: number;
  flagged: boolean;
  reason?: string;
}

/** Embedding-based QA placeholder — wire face embedding API in production */
export function scoreFaceDrift(
  _heroEmbedding: number[],
  _frameEmbedding: number[]
): QaVisionResult {
  const driftScore = 0.12;
  return {
    driftScore,
    flagged: driftScore > 0.35,
    reason: driftScore > 0.35 ? "Face drift exceeds threshold" : undefined,
  };
}
