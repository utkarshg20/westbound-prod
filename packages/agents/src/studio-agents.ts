import type { StoryBeat } from "@westbound/platform";
import { logger } from "@westbound/platform";
import type { LlmClient } from "./llm.js";
import { CONTINUITY_PROMPT_V1 } from "./prompts/continuity.js";
import { ContinuityResultSchema, ShotPlanSchema } from "./schemas.js";

export interface ContinuityResult {
  passed: boolean;
  flags: string[];
  notes: string;
}

export async function checkContinuity(
  llm: LlmClient,
  script: string,
  beats: StoryBeat[],
  canonConstraints: string[],
  options?: { productionRunId?: string; episodeNumber?: number }
): Promise<ContinuityResult> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content: CONTINUITY_PROMPT_V1,
      },
      {
        role: "user",
        content: JSON.stringify({
          script,
          episodeNumber: options?.episodeNumber,
          storyBeats: beats.map((b) => ({
            episode: b.episode_number,
            title: b.title,
            summary: b.summary,
          })),
          canonConstraints,
        }),
      },
    ],
    { temperature: 0, productionRunId: options?.productionRunId }
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    logger.error("Continuity LLM response unparseable", {
      productionRunId: options?.productionRunId,
      rawPreview: raw.text.slice(0, 500),
    });
    return {
      passed: false,
      flags: ["llm_response_unparseable", "manual_review_required"],
      notes: raw.text.slice(0, 500),
    };
  }

  const result = ContinuityResultSchema.safeParse(parsed);
  if (!result.success) {
    logger.error("Continuity schema mismatch", {
      productionRunId: options?.productionRunId,
      error: result.error.message,
    });
    return {
      passed: false,
      flags: ["llm_response_unparseable", "manual_review_required"],
      notes: raw.text.slice(0, 500),
    };
  }
  return result.data;
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
  script: string,
  options?: { productionRunId?: string }
): Promise<ShotPlan> {
  const raw = await llm.complete(
    [
      {
        role: "system",
        content:
          "Break a 3-minute rockumentary script into shots. JSON only: shots array with index, shotType (dialogue|establishing|broll), prompt, hasCharacter, providerHint (kling|veo|runway|reuse_broll).",
      },
      { role: "user", content: script },
    ],
    { temperature: 0.5, productionRunId: options?.productionRunId }
  );

  try {
    const parsed = ShotPlanSchema.safeParse(JSON.parse(raw.text));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }

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

export interface QaVisionResult {
  driftScore: number;
  flagged: boolean;
  reason?: string;
}

/** Cosine distance → drift score; threshold 0.35 */
export function driftFromEmbeddings(
  heroEmbedding: number[],
  frameEmbedding: number[]
): number {
  if (heroEmbedding.length === 0 || frameEmbedding.length === 0) return 1;
  const len = Math.min(heroEmbedding.length, frameEmbedding.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += heroEmbedding[i]! * frameEmbedding[i]!;
    normA += heroEmbedding[i]! ** 2;
    normB += frameEmbedding[i]! ** 2;
  }
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  return 1 - sim;
}

export async function scoreFaceDrift(
  heroUri: string,
  frameUri: string,
  faceClient: {
    embed(uri: string): Promise<number[]>;
  }
): Promise<QaVisionResult> {
  const [heroEmb, frameEmb] = await Promise.all([
    faceClient.embed(heroUri),
    faceClient.embed(frameUri),
  ]);
  const driftScore = driftFromEmbeddings(heroEmb, frameEmb);
  return {
    driftScore,
    flagged: driftScore > 0.35,
    reason: driftScore > 0.35 ? "Face drift exceeds threshold" : undefined,
  };
}
