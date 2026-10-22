import { logger } from "@westbound/platform";

type Run = { stage: string };
type Repo = {
  mergeProductionRunMetadata(id: string, patch: Record<string, unknown>): Promise<Run>;
  transitionProductionStage(id: string, from: never, to: never, extra?: Record<string, unknown>): Promise<Run | null>;
};

/**
 * Record a continuity result and, if it failed, send the run back to review WITHOUT undoing a decision someone made
 * while the (slow, LLM-backed) check was running.
 *
 * This used to write `stage` straight onto the row from values read before the check started, with no state-machine
 * check: if the reviewer approved the run in the meantime the job put it back in dan_review (and wrote back stale
 * metadata, dropping the approval's scheduledAt and master), and it could pull published or failed runs back too.
 * Now: the result is merged into the CURRENT metadata, and the stage only moves through the compare-and-set transition
 * from the stage the run is in NOW, which the state machine refuses (and we then leave the run alone) when moving to
 * dan_review is not legal from there.
 */
export async function recordContinuityResult(
  repo: Repo,
  runId: string,
  result: { passed: boolean; flags?: unknown }
): Promise<{ stage: string; movedToReview: boolean }> {
  const fresh = await repo.mergeProductionRunMetadata(runId, { continuity: result });
  if (result.passed || fresh.stage === "dan_review") return { stage: fresh.stage, movedToReview: false };
  try {
    const moved = await repo.transitionProductionStage(runId, fresh.stage as never, "dan_review" as never, {});
    if (moved) return { stage: moved.stage, movedToReview: true };
    logger.warn("continuity flagged a run that changed stage while the check ran; left as it is", { runId });
  } catch (e) {
    logger.warn("continuity flagged a run that cannot go back to review from its current stage; left as it is", {
      runId,
      stage: fresh.stage,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return { stage: fresh.stage, movedToReview: false };
}
