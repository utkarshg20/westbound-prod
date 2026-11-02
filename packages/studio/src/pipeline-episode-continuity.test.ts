import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionStage } from "@westbound/platform";

// A failed continuity check must move the run through legal stages and keep the result; a retry must not re-enter generating.
const state = vi.hoisted(() => ({ stage: "draft" as string, metadata: { script: "s" } as Record<string, unknown>, history: [] as string[], extra: null as unknown }));

vi.mock("@westbound/agents", () => ({
  checkContinuity: vi.fn(async () => ({ passed: false, issues: ["Sammy drinks"] })),
  createLlmClient: vi.fn(async () => ({})),
  planShots: vi.fn(),
  scoreFaceDrift: vi.fn(),
}));
vi.mock("@westbound/adapters", () => ({ createAdapterRegistry: () => ({}), createFaceEmbeddingClient: () => ({}) }));
vi.mock("@westbound/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@westbound/platform")>();
  const run = () => ({ id: "run-1", project_id: "p", title: "E1", stage: state.stage, status: "active", metadata: state.metadata, updated_at: "t1" });
  return {
    ...actual,
    createRepository: () => ({
      getProductionRun: vi.fn(async () => run()),
      listStoryBeats: vi.fn(async () => []),
      listStoryBeatOverrides: vi.fn(async () => []),
      updateProductionStage: vi.fn(async (_id: string, next: ProductionStage) => {
        actual.assertValidStageTransition(state.stage as ProductionStage, next);
        state.stage = next;
        state.history.push(next);
        return run();
      }),
      transitionProductionStage: vi.fn(async (_id: string, from: ProductionStage, to: ProductionStage, extra: unknown) => {
        actual.assertValidStageTransition(from, to);
        state.stage = to;
        state.history.push(to);
        state.extra = extra;
        state.metadata = (extra as { metadata: Record<string, unknown> }).metadata;
        return run();
      }),
    }),
  };
});

const { StudioPipeline } = await import("./pipeline.js");
const make = () => new (StudioPipeline as unknown as new (l: unknown, a: unknown) => InstanceType<typeof StudioPipeline>)({}, {});

beforeEach(() => { state.stage = "draft"; state.metadata = { script: "s" }; state.history = []; state.extra = null; });

describe("runEpisodeGeneration continuity failure", () => {
  it("goes generating -> assets_ready -> dan_review and records the continuity result", async () => {
    await make().runEpisodeGeneration("run-1");
    expect(state.history).toEqual(["generating", "assets_ready", "dan_review"]);
    expect((state.metadata as { continuity: { passed: boolean } }).continuity.passed).toBe(false);
    expect((state.extra as { expectedUpdatedAt: string }).expectedUpdatedAt).toBe("t1");
  });

  it("a retry that finds the run already generating does not try generating -> generating", async () => {
    state.stage = "generating";
    await expect(make().runEpisodeGeneration("run-1")).resolves.toBeTruthy();
    expect(state.history[0]).toBe("assets_ready");
  });
});
