import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionStage } from "@westbound/platform";

// publish() must refuse any run that is not scheduled BEFORE touching YouTube, and must not upload twice on a retry.
const state = vi.hoisted(() => ({
  stage: "scheduled" as string,
  metadata: {} as Record<string, unknown>,
  ytCalls: 0,
  failDspLiveOnce: false,
  markError: null as { message: string } | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@westbound/dsp", () => ({ getReleaseChecklist: () => [], createDspRelease: vi.fn() }));
vi.mock("@westbound/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@westbound/platform")>();
  const run = () => ({ id: "run-1", title: "Episode 1", stage: state.stage, status: "active", metadata: state.metadata });
  return {
    ...actual,
    createRepository: () => ({
      getProductionRun: vi.fn(async () => run()),
      updateProductionStage: vi.fn(async (_id: string, next: ProductionStage) => {
        if (next === "dsp_live" && state.failDspLiveOnce) {
          state.failDspLiveOnce = false;
          throw new Error("transient db error");
        }
        actual.assertValidStageTransition(state.stage as ProductionStage, next);
        state.stage = next;
        return run();
      }),
    }),
    createSupabaseAdmin: () => ({
      from: () => ({
        update: (values: { metadata: Record<string, unknown> }) => ({
          eq: async () => {
            state.updates.push(values.metadata);
            if (!state.markError) state.metadata = values.metadata;
            return { error: state.markError };
          },
        }),
      }),
    }),
  };
});

const { StudioPipeline } = await import("./pipeline.js");
const make = () =>
  new (StudioPipeline as unknown as new (library: unknown, adapters: unknown) => InstanceType<typeof StudioPipeline>)(
    {},
    { publishers: { youtube: { publish: async () => { state.ytCalls++; } } } }
  );

beforeEach(() => {
  state.stage = "scheduled";
  state.metadata = { resolveMasterUri: "r2://b/m.mov" };
  state.ytCalls = 0;
  state.failDspLiveOnce = false;
  state.markError = null;
  state.updates = [];
});

describe("StudioPipeline.publish review gate", () => {
  for (const stage of ["draft", "assets_ready", "dan_review", "failed", "published", "dsp_live"]) {
    it(`refuses a run in ${stage} before any upload`, async () => {
      state.stage = stage;
      await expect(make().publish("run-1")).rejects.toThrow(/not scheduled/);
      expect(state.ytCalls).toBe(0);
      expect(state.updates).toEqual([]);
    });
  }

  it("publishes a scheduled run once and ends in dsp_live", async () => {
    const run = await make().publish("run-1");
    expect(state.ytCalls).toBe(1);
    expect(run.stage).toBe("dsp_live");
    expect(state.metadata.youtubePublishedAt).toBeTruthy();
  });

  it("a retry after the upload but before the final stage does not upload to YouTube again", async () => {
    state.failDspLiveOnce = true;
    await expect(make().publish("run-1")).rejects.toThrow(/transient/);
    expect(state.ytCalls).toBe(1);
    expect(state.stage).toBe("published"); // got as far as published; the retry is refused at the stage gate, never re-uploads
    await expect(make().publish("run-1")).rejects.toThrow(/not scheduled/);
    expect(state.ytCalls).toBe(1);
  });

  it("when the upload cannot be recorded it says so and says not to retry blindly", async () => {
    state.markError = { message: "db down" };
    await expect(make().publish("run-1")).rejects.toThrow(/could not be recorded.*do NOT retry/);
    expect(state.ytCalls).toBe(1);
  });

  it("an already-recorded upload is skipped if the run is still scheduled (a partial failure before the stage moved)", async () => {
    state.metadata = { resolveMasterUri: "r2://b/m.mov", youtubePublishedAt: "2026-10-22T00:00:00Z" };
    await make().publish("run-1");
    expect(state.ytCalls).toBe(0);
  });
});
