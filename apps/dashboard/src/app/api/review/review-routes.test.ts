import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as approve } from "./approve/route";
import { POST as reject } from "./reject/route";
import { POST as masterUpload } from "./master-upload/route";

// Mechanical route tests: the real Supabase SDK talks to an in-memory PostgREST
// double and the worker is a recorded fetch. No hosted Supabase, R2 or YouTube.
const DB = "https://db.example.test";
const WORKER = "http://worker.example.test";
const RUN_ID = "0b6c1d9e-6f3e-4c1a-9a51-6f1f2a3b4c5d";
const UNKNOWN_ID = "9f9f9f9f-0000-4000-8000-000000000000";
const UPDATED_AT = "2026-09-30T12:00:00.123456+00:00";
const REVIEWER = "reviewer@example.test";

type Row = Record<string, unknown> & { id: string };
type Call = { method: string; table: string; url: URL; body: Record<string, unknown> | null };

let runs: Map<string, Row>;
let dbCalls: Call[];
let workerCalls: Record<string, unknown>[];
let events: string[];
let unexpected: string[];
let failStatus: { GET?: number; PATCH?: number };
let workerStatus: number;
let beforePatch: (() => void) | undefined;

function run(stage: string, metadata: Record<string, unknown> = {}): Row {
  return {
    id: RUN_ID,
    project_id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
    kind: "episode",
    title: "Episode 1 — The Noise",
    stage,
    status: "active",
    cost_cents: 0,
    metadata,
    created_at: "2026-09-01T00:00:00+00:00",
    updated_at: UPDATED_AT,
  };
}
const withMaster = { resolveMasterUri: "r2://westbound-assets/masters/ep1.mov" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function matches(row: Row, url: URL) {
  for (const [key, value] of url.searchParams) {
    if (key === "select" || key === "columns") continue;
    if (!value.startsWith("eq.") || String(row[key]) !== value.slice(3)) return false;
  }
  return true;
}
function post(path: string, body: unknown, callerEmail = REVIEWER) {
  return new Request(`https://studio.example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-email": callerEmail },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", DB);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("WORKER_API_URL", WORKER);
  vi.stubEnv("N8N_WEBHOOK_SECRET", "worker-secret");
  vi.stubEnv("REVIEWER_EMAIL", REVIEWER);
  runs = new Map();
  dbCalls = [];
  workerCalls = [];
  events = [];
  unexpected = [];
  failStatus = {};
  workerStatus = 202;
  beforePatch = undefined;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      if (url.origin === WORKER && url.pathname === "/api/jobs/enqueue" && method === "POST") {
        expect(new Headers(init?.headers).get("x-n8n-secret")).toBe("worker-secret");
        workerCalls.push(body ?? {});
        events.push(`worker:${String(body?.type)}`);
        return json({ ok: true }, workerStatus);
      }
      const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
      if (url.origin !== DB || table !== "production_runs") {
        unexpected.push(`${method} ${url}`);
        return json({ message: "unexpected" }, 400);
      }
      dbCalls.push({ method, table, url, body });
      events.push(`db:${method}`);
      const failure = failStatus[method as "GET" | "PATCH"];
      if (failure) return json({ code: "XX000", message: "private database detail" }, failure);
      if (method === "GET") {
        return json([...runs.values()].filter((r) => matches(r, url)));
      }
      if (method === "PATCH") {
        beforePatch?.();
        const hit = [...runs.values()].filter((r) => matches(r, url));
        for (const r of hit) {
          Object.assign(r, body, { updated_at: "2026-10-02T00:00:00.000000+00:00" });
        }
        return json(hit);
      }
      unexpected.push(`${method} ${url}`);
      return json({ message: "unexpected" }, 400);
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  expect(unexpected).toEqual([]);
});

const approveRun = (itemId = RUN_ID) => approve(post("/api/review/approve", { itemId, queue: "hero_publish" }));
const rejectRun = (itemId = RUN_ID) => reject(post("/api/review/reject", { itemId, queue: "hero_publish" }));
const patches = () => dbCalls.filter((c) => c.method === "PATCH");

describe("POST /api/review/approve (hero_publish)", () => {
  it("conditionally moves dan_review -> scheduled, then queues the publish job", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await approveRun();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stage: "scheduled" });

    expect(patches()).toHaveLength(1);
    const filter = patches()[0].url.searchParams;
    expect(filter.get("id")).toBe(`eq.${RUN_ID}`);
    expect(filter.get("stage")).toBe("eq.dan_review");
    expect(filter.get("updated_at")).toBe(`eq.${UPDATED_AT}`);
    expect(patches()[0].body).toMatchObject({
      stage: "scheduled",
      metadata: { ...withMaster, scheduledAt: expect.any(String) },
    });
    expect(runs.get(RUN_ID)?.stage).toBe("scheduled");

    expect(workerCalls).toEqual([
      { type: "youtube.publish", productionRunId: RUN_ID, payload: { runId: RUN_ID } },
    ]);
    expect(events).toEqual(["db:GET", "db:PATCH", "worker:youtube.publish"]);
  });

  it("accepts an episode video when no master was uploaded", async () => {
    runs.set(RUN_ID, run("dan_review", { episodeVideoUri: "r2://westbound-assets/ep1.mp4" }));
    expect((await approveRun()).status).toBe(200);
    expect(workerCalls).toHaveLength(1);
  });

  it.each(["draft", "generating", "assets_ready", "scheduled", "published", "dsp_live", "failed"])(
    "refuses a run in %s with 409, writes nothing and never calls the worker",
    async (stage) => {
      runs.set(RUN_ID, run(stage, withMaster));
      const res = await approveRun();
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ stage });
      expect(patches()).toEqual([]);
      expect(workerCalls).toEqual([]);
      expect(runs.get(RUN_ID)?.stage).toBe(stage);
    }
  );

  it("refuses a dan_review run with neither a master nor an episode video (409)", async () => {
    runs.set(RUN_ID, run("dan_review", { resolveMasterUri: "  ", heroUri: "r2://hero.png" }));
    const res = await approveRun();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/master/);
    expect(patches()).toEqual([]);
    expect(workerCalls).toEqual([]);
    expect(runs.get(RUN_ID)?.stage).toBe("dan_review");
  });

  it("returns 404 for an unknown run and never calls the worker", async () => {
    const res = await approveRun(UNKNOWN_ID);
    expect(res.status).toBe(404);
    expect(patches()).toEqual([]);
    expect(workerCalls).toEqual([]);
  });

  it("returns 500 (not ok:true) when loading the run fails", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    failStatus.GET = 500;
    const res = await approveRun();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private database detail");
    expect(workerCalls).toEqual([]);
  });

  it("returns 500 when the stage update fails and never calls the worker", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    failStatus.PATCH = 500;
    const res = await approveRun();
    expect(res.status).toBe(500);
    expect(workerCalls).toEqual([]);
  });

  it("returns 409 when the run changes between read and update (e.g. a concurrent master upload)", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    beforePatch = () => {
      const row = runs.get(RUN_ID)!;
      row.updated_at = "2026-10-01T09:09:09.000000+00:00";
      row.metadata = { resolveMasterUri: "r2://westbound-assets/masters/ep1-v2.mov" };
    };
    const res = await approveRun();
    expect(res.status).toBe(409);
    expect(runs.get(RUN_ID)).toMatchObject({
      stage: "dan_review",
      metadata: { resolveMasterUri: "r2://westbound-assets/masters/ep1-v2.mov" },
    });
    expect(workerCalls).toEqual([]);
  });

  it("returns 409 when another approval already moved the run", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    beforePatch = () => {
      runs.get(RUN_ID)!.stage = "scheduled";
    };
    expect((await approveRun()).status).toBe(409);
    expect(workerCalls).toEqual([]);
  });

  it("reports 502 (run scheduled, job not queued) when the worker refuses the job", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    workerStatus = 503;
    const res = await approveRun();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ stage: "scheduled" });
    expect(workerCalls).toHaveLength(1);
  });
});

describe("POST /api/review/reject (hero_publish)", () => {
  it("conditionally moves dan_review -> failed", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await rejectRun();
    expect(res.status).toBe(200);
    expect(patches()).toHaveLength(1);
    expect(patches()[0].url.searchParams.get("stage")).toBe("eq.dan_review");
    expect(runs.get(RUN_ID)).toMatchObject({
      stage: "failed",
      status: "failed",
      metadata: { ...withMaster, rejectReason: "dan_rejected", rejectedAt: expect.any(String) },
    });
    expect(workerCalls).toEqual([]);
  });

  it.each(["assets_ready", "scheduled", "published", "dsp_live", "failed"])(
    "refuses to reject a run in %s (409) and writes nothing",
    async (stage) => {
      runs.set(RUN_ID, run(stage, withMaster));
      expect((await rejectRun()).status).toBe(409);
      expect(patches()).toEqual([]);
      expect(runs.get(RUN_ID)?.stage).toBe(stage);
    }
  );

  it("returns 404 for an unknown run", async () => {
    expect((await rejectRun(UNKNOWN_ID)).status).toBe(404);
    expect(patches()).toEqual([]);
  });

  it("returns 500 when the update fails", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    failStatus.PATCH = 500;
    expect((await rejectRun()).status).toBe(500);
  });
});

describe("REVIEWER_EMAIL restriction (hero_publish)", () => {
  it("returns 403 when a non-reviewer tries to approve", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await approve(post("/api/review/approve", { itemId: RUN_ID, queue: "hero_publish" }, "other@example.test"));
    expect(res.status).toBe(403);
    expect(patches()).toEqual([]);
    expect(workerCalls).toEqual([]);
  });

  it("returns 403 when a non-reviewer tries to reject", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await reject(post("/api/review/reject", { itemId: RUN_ID, queue: "hero_publish" }, "other@example.test"));
    expect(res.status).toBe(403);
    expect(patches()).toEqual([]);
  });

  it("allows approve/reject when REVIEWER_EMAIL is not set (open policy)", async () => {
    vi.stubEnv("REVIEWER_EMAIL", "");
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await approve(post("/api/review/approve", { itemId: RUN_ID, queue: "hero_publish" }, "anyone@example.test"));
    expect(res.status).toBe(200);
  });

  it("returns 403 when reviewer email header is missing for hero_publish", async () => {
    runs.set(RUN_ID, run("dan_review", withMaster));
    const res = await approve(post("/api/review/approve", { itemId: RUN_ID, queue: "hero_publish" }, ""));
    expect(res.status).toBe(403);
    expect(patches()).toEqual([]);
    expect(workerCalls).toEqual([]);
  });
});

describe("review decision body validation", () => {
  it.each([
    ["non-JSON", "itemId=1"],
    ["missing queue", { itemId: RUN_ID }],
    ["unknown queue", { itemId: RUN_ID, queue: "ref_intake" }],
    ["empty itemId", { itemId: "  ", queue: "hero_publish" }],
    ["numeric itemId", { itemId: 7, queue: "hero_publish" }],
    ["non-UUID itemId", { itemId: "../runs", queue: "hero_publish" }],
  ])("returns 400 for %s and makes no database or worker call", async (_label, body) => {
    for (const route of [approve, reject]) {
      const res = await route(post("/api/review/x", body));
      expect(res.status).toBe(400);
    }
    expect(dbCalls).toEqual([]);
    expect(workerCalls).toEqual([]);
  });

  it("keeps the demo response when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await approve(post("/api/review/approve", { itemId: "demo-hero-1", queue: "hero_publish" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo: true });
    expect(workerCalls).toEqual([]);
  });
});

describe("POST /api/review/master-upload stage check", () => {
  function upload() {
    const form = new FormData();
    form.set("runId", RUN_ID);
    form.set("file", new File([new Uint8Array([1, 2, 3])], "ep1.mov", { type: "video/quicktime" }));
    return masterUpload(new Request("https://studio.example.test/api/review/master-upload", {
      method: "POST",
      body: form,
    }));
  }

  it.each(["published", "dsp_live", "failed"])(
    "refuses a master for a run in %s before uploading anything",
    async (stage) => {
      runs.set(RUN_ID, run(stage));
      const res = await upload();
      expect(res.status).toBe(409);
      expect(dbCalls.map((c) => c.method)).toEqual(["GET"]);
    }
  );

  it("returns 404 for an unknown run", async () => {
    expect((await upload()).status).toBe(404);
  });
});
