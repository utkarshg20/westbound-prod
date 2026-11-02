import { describe, expect, it, vi } from "vitest";

vi.mock("@westbound/platform", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const { recordContinuityResult } = await import("./continuity.js");

function fakeRepo(stage: string, opts: { legalToReview?: boolean; changed?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    repo: {
      mergeProductionRunMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        calls.push(`merge:${Object.keys(patch).join(",")}`);
        return { stage };
      }),
      transitionProductionStage: vi.fn(async (_id: string, from: string, to: string) => {
        calls.push(`transition:${from}->${to}`);
        if (opts.legalToReview === false) throw new Error(`Invalid production stage transition: ${from} -> ${to}`);
        return opts.changed ? null : { stage: to };
      }),
    },
  };
}

describe("recordContinuityResult", () => {
  it("a passing check only records the result; the stage is never written", async () => {
    const { repo, calls } = fakeRepo("scheduled");
    expect(await recordContinuityResult(repo as never, "r1", { passed: true })).toEqual({ stage: "scheduled", movedToReview: false });
    expect(calls).toEqual(["merge:continuity"]);
  });

  it("a failing check sends a run back to review through the state machine", async () => {
    const { repo, calls } = fakeRepo("assets_ready");
    expect(await recordContinuityResult(repo as never, "r1", { passed: false })).toEqual({ stage: "dan_review", movedToReview: true });
    expect(calls).toEqual(["merge:continuity", "transition:assets_ready->dan_review"]);
  });

  it("does NOT undo an approval: from scheduled the move is illegal and the run is left alone", async () => {
    const { repo } = fakeRepo("scheduled", { legalToReview: false });
    expect(await recordContinuityResult(repo as never, "r1", { passed: false })).toEqual({ stage: "scheduled", movedToReview: false });
  });

  it("leaves a run that moved on while the check ran, and one already in review", async () => {
    expect((await recordContinuityResult(fakeRepo("assets_ready", { changed: true }).repo as never, "r1", { passed: false })).movedToReview).toBe(false);
    const inReview = fakeRepo("dan_review");
    expect(await recordContinuityResult(inReview.repo as never, "r1", { passed: false })).toEqual({ stage: "dan_review", movedToReview: false });
    expect(inReview.calls).toEqual(["merge:continuity"]);
  });
});
