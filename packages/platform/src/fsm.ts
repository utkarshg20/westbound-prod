import type { ProductionStage } from "./types.js";

export const VALID_TRANSITIONS: Record<ProductionStage, ProductionStage[]> = {
  draft: ["generating", "failed"],
  generating: ["assets_ready", "failed"],
  assets_ready: ["dan_review", "failed"],
  dan_review: ["scheduled", "failed", "generating"],
  scheduled: ["published", "failed"],
  published: ["dsp_live", "failed"],
  dsp_live: [],
  failed: ["draft"],
};

export function assertValidStageTransition(
  current: ProductionStage,
  next: ProductionStage
): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid production stage transition: ${current} → ${next}`);
  }
}
