import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionStage } from "@westbound/platform";

// publish() must refuse any run that is not scheduled BEFORE touching YouTube, and must not upload twice on a retry.
const state = vi.hoisted(() => ({
  stage: "scheduled" as string,
  metadata: {} as Record<string, unknown>,
  ytCalls: 0,
  failDspLiveOnce: false,
  ytFails: false,
  ytError: null as Error | null,
  onYoutube: null as null | (() => void),
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
        update: (values: { metadata: Record<string, unknown> }) => {
          // A chainable, awaitable query like PostgREST's: .eq/.is filters, .select() returns the rows it touched.
          const filters: Array<[string, unknown]> = [];
          const apply = () => {
            const claimFilter = filters.find(([c]) => c === "metadata->>youtubeUploadClaimedAt");
            if (claimFilter && (state.metadata.youtubeUploadClaimedAt ?? null) !== claimFilter[1]) return { data: [], error: null };
            const isClaim = Boolean(claimFilter) || (values.metadata.youtubeUploadClaimedAt !== undefined && values.metadata.youtubePublishedAt === undefined);
            const error = isClaim ? null : state.markError;
            state.updates.push(values.metadata);
            if (!error) state.metadata = values.metadata;
            return { data: [{ id: "run-1" }], error };
          };
          const q: Record<string, unknown> = {
            eq: (c: string, v: unknown) => (filters.push([c, v]), q),
            is: (c: string, v: unknown) => (filters.push([c, v]), q),
            select: async () => apply(),
            then: (resolve: (v: unknown) => unknown) => resolve(apply()),
          };
          return q;
        },
      }),
    }),
  };
});

const { StudioPipeline } = await import("./pipeline.js");
const make = () =>
  new (StudioPipeline as unknown as new (library: unknown, adapters: unknown) => InstanceType<typeof StudioPipeline>)(
    {},
    { publishers: { youtube: { publish: async () => {
      state.ytCalls++;
      state.onYoutube?.();
      if (state.ytError) throw state.ytError;
      if (state.ytFails) throw new Error("youtube down");
      return { externalId: "vid-1", url: "https://www.youtube.com/watch?v=vid-1" };
    } } } }
  );

beforeEach(() => {
  state.stage = "scheduled";
  state.metadata = { resolveMasterUri: "r2://b/m.mov" };
  state.ytCalls = 0;
  state.failDspLiveOnce = false;
  state.ytFails = false;
  state.ytError = null;
  state.onYoutube = null;
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
    expect(state.stage).toBe("published"); // got as far as published
    const finished = await make().publish("run-1"); // the retry finishes the move without uploading again
    expect(finished.stage).toBe("dsp_live");
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

  it("records the video id YouTube returned", async () => {
    await make().publish("run-1");
    expect(state.metadata.youtubeVideoId).toBe("vid-1");
    expect(state.metadata.youtubeUrl).toContain("vid-1");
  });

  it("a second job for the same run does not upload while the first holds the claim", async () => {
    state.metadata = { resolveMasterUri: "r2://b/m.mov", youtubeUploadClaimedAt: new Date().toISOString() };
    await expect(make().publish("run-1")).rejects.toThrow(/already uploading/);
    expect(state.ytCalls).toBe(0);
  });

  it("a claim left by a crashed job is taken over after the timeout", async () => {
    state.metadata = { resolveMasterUri: "r2://b/m.mov", youtubeUploadClaimedAt: new Date(Date.now() - 61 * 60_000).toISOString() };
    const run = await make().publish("run-1");
    expect(state.ytCalls).toBe(1);
    expect(run.stage).toBe("dsp_live");
  });

  it("a failed upload gives the claim back so the retry can run at once", async () => {
    state.ytFails = true;
    await expect(make().publish("run-1")).rejects.toThrow(/youtube down/);
    expect(state.metadata.youtubeUploadClaimedAt).toBeUndefined();
    state.ytFails = false;
    await make().publish("run-1");
    expect(state.ytCalls).toBe(2);
  });

  it("when the upload's outcome is unknown the claim is kept, so the retries do not upload a second copy", async () => {
    state.ytError = Object.assign(new Error("interrupted after the video was sent"), { name: "UploadOutcomeUnknown" });
    await expect(make().publish("run-1")).rejects.toThrow(/check the channel/);
    expect(typeof state.metadata.youtubeUploadClaimedAt).toBe("string");
    state.ytError = null;
    await expect(make().publish("run-1")).rejects.toThrow(/already uploading/);
    expect(state.ytCalls).toBe(1);
  });

  it("a failed job only releases a claim that is still its own", async () => {
    state.ytFails = true;
    state.onYoutube = () => { state.metadata = { ...state.metadata, youtubeUploadClaimedAt: "someone-else-took-over" }; };
    await expect(make().publish("run-1")).rejects.toThrow(/youtube down/);
    expect(state.metadata.youtubeUploadClaimedAt).toBe("someone-else-took-over");
  });
});

