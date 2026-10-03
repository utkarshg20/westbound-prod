import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionStage } from "@westbound/platform";

// Mechanical test of StudioPipeline.approveAndSchedule with in-memory doubles:
// no Supabase, Redis or provider calls.
const state = vi.hoisted(() => ({
  stage: "dan_review" as string,
  metadata: {} as Record<string, unknown>,
  events: [] as string[],
}));

vi.mock("@westbound/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@westbound/platform")>();
  const run = () => ({
    id: "run-1",
    title: "Episode 1",
    stage: state.stage,
    status: "active",
    metadata: state.metadata,
  });
  return {
    ...actual,
    createRepository: () => ({
      getProductionRun: vi.fn(async () => run()),
      updateProductionStage: vi.fn(async (_id: string, next: ProductionStage) => {
        actual.assertValidStageTransition(state.stage as ProductionStage, next);
        state.events.push(`stage:${state.stage}->${next}`);
        state.stage = next;
        return run();
      }),
    }),
    createSupabaseAdmin: () => ({
      from: () => ({
        insert: vi.fn(async () => {
          state.events.push("releases.insert");
          return { error: null };
        }),
      }),
    }),
    enqueueJob: vi.fn(async (type: string) => {
      state.events.push(`enqueue:${type}:stage=${state.stage}`);
      return "job-1";
    }),
  };
});

const { StudioPipeline } = await import("./pipeline.js");
const pipeline = () =>
  new (StudioPipeline as unknown as new (library: unknown, adapters: unknown) => InstanceType<
    typeof StudioPipeline
  >)({}, {});

beforeEach(() => {
  state.stage = "dan_review";
  state.metadata = { resolveMasterUri: "r2://bucket/master.mov" };
  state.events = [];
});

describe("StudioPipeline.approveAndSchedule", () => {
  it("moves dan_review -> scheduled exactly once and queues publish after it", async () => {
    const run = await pipeline().approveAndSchedule("run-1", new Date("2026-10-10T00:00:00Z"));
    expect(run.stage).toBe("scheduled");
    expect(state.events).toEqual([
      "stage:dan_review->scheduled",
      "releases.insert",
      "enqueue:youtube.publish:stage=scheduled",
    ]);
  });

  it("refuses to schedule a run without a master or episode video", async () => {
    state.metadata = {};
    await expect(pipeline().approveAndSchedule("run-1", new Date())).rejects.toThrow(
      /resolveMasterUri/
    );
    expect(state.stage).toBe("dan_review");
    expect(state.events).toEqual([]);
  });

  it("refuses runs that are not in dan_review and queues nothing", async () => {
    state.stage = "assets_ready";
    await expect(pipeline().approveAndSchedule("run-1", new Date())).rejects.toThrow(
      /assets_ready → scheduled/
    );
    expect(state.events).toEqual([]);
  });
});
