import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tracks: {} as Record<string, { id: string; source: string; title: string; mood_tags: string[]; metadata: Record<string, unknown> }>,
  published: [] as string[],
  jobs: [] as string[],
  updates: [] as unknown[],
}));

vi.mock("@westbound/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@westbound/platform")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    createRepository: () => ({ getTrack: async (id: string) => state.tracks[id] ?? null }),
    createSupabaseAdmin: () => ({ from: () => ({ update: (v: unknown) => ({ eq: async () => (state.updates.push(v), { error: null }) }) }) }),
    enqueueJob: vi.fn(async (type: string) => { state.jobs.push(type); return "job"; }),
  };
});
vi.mock("@westbound/adapters", () => ({ createAdapterRegistry: () => ({ publishers: { songtradr: { publish: async (i: { title: string }) => { state.published.push(i.title); } } } }) }));
vi.mock("@westbound/agents", () => ({ createLlmClient: vi.fn(), scoreBriefVariant: vi.fn(), signalToSunoPrompt: vi.fn(), tagTrackMetadata: vi.fn() }));

const { SyncEngine } = await import("./pipeline.js");
const { routeTrackToEngines } = await import("./multi-router.js");

const track = (id: string, metadata: Record<string, unknown>, source = "sync") => ({ id, source, title: id, mood_tags: [], metadata });
beforeEach(() => { state.tracks = {}; state.published = []; state.jobs = []; state.updates = []; });

describe("uploadApprovedTracks", () => {
  it("submits only approved sync tracks that are not already uploaded", async () => {
    state.tracks = {
      ok: track("ok", { qaStatus: "approved" }),
      held: track("held", { qaStatus: "hold_for_dan" }),
      pending: track("pending", { qaStatus: "pending_curation" }),
      done: track("done", { qaStatus: "approved", uploaded: true }),
      sammy: track("sammy", { qaStatus: "approved" }, "sammy"),
    };
    await new SyncEngine().uploadApprovedTracks(["ok", "held", "pending", "done", "sammy", "missing"]);
    expect(state.published).toEqual(["ok"]);
  });
});

describe("multi-route", () => {
  it("does not send an unapproved track to the DSP release, but still routes the rest", async () => {
    state.tracks = { t: track("t", { qaStatus: "pending_curation" }) };
    await routeTrackToEngines("t");
    expect(state.jobs).not.toContain("dsp.release_candidate");
    expect(state.jobs).toContain("identifyy.register");
  });
  it("routes an approved track to the DSP release", async () => {
    state.tracks = { t: track("t", { qaStatus: "approved" }) };
    await routeTrackToEngines("t");
    expect(state.jobs).toContain("dsp.release_candidate");
  });
});
