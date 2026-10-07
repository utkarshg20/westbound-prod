import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as fsm from "./fsm.js";
import { WestboundRepository } from "./db.js";
import { ProductionStageSchema, type ProductionStage } from "./types.js";

const { VALID_TRANSITIONS, assertValidStageTransition } = fsm;
const STAGES = ProductionStageSchema.options;
const isValid = (from: ProductionStage, to: ProductionStage) =>
  // isValidStageTransition is new on this branch; fail loudly (not "undefined is not a function") on the base.
  typeof fsm.isValidStageTransition === "function"
    ? fsm.isValidStageTransition(from, to)
    : expect.fail("isValidStageTransition is not exported");

describe("production stage FSM (illegal transitions throw)", () => {
  it("defines transitions for every stage, only towards known stages", () => {
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual([...STAGES].sort());
    for (const targets of Object.values(VALID_TRANSITIONS)) {
      for (const t of targets) expect(STAGES).toContain(t);
    }
  });

  it("only dan_review can reach scheduled (human approval gate)", () => {
    for (const from of STAGES) {
      expect(isValid(from, "scheduled")).toBe(from === "dan_review");
      if (from !== "dan_review") {
        expect(() => assertValidStageTransition(from, "scheduled")).toThrow(
          /Invalid production stage transition/
        );
      }
    }
  });

  it("allows dan_review -> scheduled and dan_review -> failed", () => {
    expect(() => assertValidStageTransition("dan_review", "scheduled")).not.toThrow();
    expect(() => assertValidStageTransition("dan_review", "failed")).not.toThrow();
  });

  it.each(STAGES)("rejects the self-transition %s -> itself", (stage) => {
    expect(isValid(stage, stage)).toBe(false);
    expect(() => assertValidStageTransition(stage, stage)).toThrow(
      `Invalid production stage transition: ${stage} → ${stage}`
    );
  });

  it("dsp_live is terminal and published needs scheduled first", () => {
    expect(VALID_TRANSITIONS.dsp_live).toEqual([]);
    for (const from of STAGES) {
      expect(isValid(from, "published")).toBe(from === "scheduled");
    }
  });
});

describe("WestboundRepository.transitionProductionStage (compare-and-set)", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  let requests: { method: string; url: URL; body: unknown }[];
  let patchRows: unknown[];
  const row = (stage: ProductionStage) => ({
    id: runId,
    project_id: "22222222-2222-4222-8222-222222222222",
    kind: "episode",
    title: "Episode 1",
    stage,
    status: "active",
    cost_cents: 0,
    metadata: {},
    created_at: "2026-09-01T00:00:00.000000+00:00",
    updated_at: "2026-09-01T00:00:00.000000+00:00",
  });

  beforeEach(() => {
    requests = [];
    patchRows = [row("scheduled")];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = init?.method ?? "GET";
        requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const result = method === "PATCH" ? patchRows : [row("dan_review")];
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const repo = () =>
    new WestboundRepository(
      createClient("https://db.example.test", "service-role-key", {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );

  it("filters the update on the expected current stage", async () => {
    const r = repo() as unknown as Record<string, unknown>;
    if (typeof r.transitionProductionStage !== "function") {
      expect.fail("transitionProductionStage is not implemented");
    }
    const run = await repo().transitionProductionStage(runId, "dan_review", "scheduled", {
      metadata: { scheduledAt: "x" },
      expectedUpdatedAt: "2026-09-01T00:00:00.000000+00:00",
    });
    expect(run?.stage).toBe("scheduled");
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url.searchParams.get("id")).toBe(`eq.${runId}`);
    expect(requests[0].url.searchParams.get("stage")).toBe("eq.dan_review");
    expect(requests[0].url.searchParams.get("updated_at")).toBe(
      "eq.2026-09-01T00:00:00.000000+00:00"
    );
    expect(requests[0].body).toMatchObject({ stage: "scheduled", metadata: { scheduledAt: "x" } });
  });

  it("returns null (no throw) when the run is no longer in the expected stage", async () => {
    patchRows = [];
    await expect(
      repo().transitionProductionStage(runId, "dan_review", "scheduled")
    ).resolves.toBeNull();
  });

  it("throws on an illegal transition before touching the database", async () => {
    await expect(
      repo().transitionProductionStage(runId, "scheduled", "scheduled")
    ).rejects.toThrow(/scheduled → scheduled/);
    expect(requests).toEqual([]);
  });

  it("updateProductionStage applies a conditional update from the stage it read", async () => {
    const run = await repo().updateProductionStage(runId, "scheduled");
    expect(run.stage).toBe("scheduled");
    expect(requests.map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expect(requests[1].url.searchParams.get("stage")).toBe("eq.dan_review");
  });

  it("updateProductionStage throws when the stage changed underneath it", async () => {
    patchRows = [];
    await expect(repo().updateProductionStage(runId, "scheduled")).rejects.toThrow(
      /left stage dan_review/
    );
  });
});
