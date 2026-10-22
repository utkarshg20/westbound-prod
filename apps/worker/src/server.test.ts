import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueJob } = vi.hoisted(() => ({ enqueueJob: vi.fn(async (..._args: unknown[]) => "job-1") }));

vi.mock("@westbound/platform", () => {
  const known = ["sync.generate_batch", "youtube.publish", "studio.render_shorts"];
  return {
    enqueueJob,
    // Same contract as the real zod enum: safeParse -> { success, data }.
    JobTypeSchema: { safeParse: (v: unknown) => (typeof v === "string" && known.includes(v) ? { success: true, data: v } : { success: false }) },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock("./handlers.js", () => ({ runPocJob: vi.fn(async () => []), runVerticalSliceJob: vi.fn(async () => ({})) }));

const { createServer } = await import("./server.js");

const KEYS = ["N8N_WEBHOOK_SECRET", "WORKER_ALLOW_UNAUTHENTICATED", "NODE_ENV"] as const;
const saved: Record<string, string | undefined> = {};
let close: (() => void) | undefined;

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  enqueueJob.mockClear();
});
afterEach(() => {
  close?.();
  close = undefined;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function boot(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const server = createServer().listen(0);
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path: string, init: { method?: string; secret?: string; body?: unknown } = {}) =>
    fetch(base + path, {
      method: init.method ?? "POST",
      headers: { "content-type": "application/json", ...(init.secret !== undefined ? { "x-n8n-secret": init.secret } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
}

describe("worker authentication", () => {
  it("refuses everything except /health when no secret is configured (fail closed)", async () => {
    const call = await boot({});
    expect((await call("/health", { method: "GET" })).status).toBe(200);
    const r = await call("/api/jobs/enqueue", { body: { type: "youtube.publish" } });
    expect(r.status).toBe(503);
    expect((await call("/api/studio/poc")).status).toBe(503);
    expect((await call("/api/studio/vertical-slice")).status).toBe(503);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("does not run open in production even when the opt-in flag is set", async () => {
    const call = await boot({ WORKER_ALLOW_UNAUTHENTICATED: "true", NODE_ENV: "production" });
    expect((await call("/api/jobs/enqueue", { body: { type: "youtube.publish" } })).status).toBe(503);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("runs open only with the explicit local opt-in outside production", async () => {
    const call = await boot({ WORKER_ALLOW_UNAUTHENTICATED: "true", NODE_ENV: "development" });
    expect((await call("/api/jobs/enqueue", { body: { type: "youtube.publish" } })).status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("with a secret set: a missing or wrong header is 401, the right one is accepted", async () => {
    const call = await boot({ N8N_WEBHOOK_SECRET: "s3cret" });
    expect((await call("/api/jobs/enqueue", { body: { type: "youtube.publish" } })).status).toBe(401);
    expect((await call("/api/jobs/enqueue", { secret: "wrong", body: { type: "youtube.publish" } })).status).toBe(401);
    expect((await call("/api/jobs/enqueue", { secret: "s3cret-but-longer", body: { type: "youtube.publish" } })).status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
    expect((await call("/api/jobs/enqueue", { secret: "s3cret", body: { type: "youtube.publish" } })).status).toBe(200);
  });

  it("the opt-in flag never weakens a configured secret", async () => {
    const call = await boot({ N8N_WEBHOOK_SECRET: "s3cret", WORKER_ALLOW_UNAUTHENTICATED: "true", NODE_ENV: "development" });
    expect((await call("/api/jobs/enqueue", { body: { type: "youtube.publish" } })).status).toBe(401);
  });
});

describe("enqueue validation", () => {
  it("rejects an unknown job type and a non-object payload before anything is queued", async () => {
    const call = await boot({ N8N_WEBHOOK_SECRET: "k" });
    for (const body of [{ type: "rm.rf" }, {}, { type: 5 }, { type: "youtube.publish", payload: "x" }, { type: "youtube.publish", payload: [1] }, { type: "youtube.publish", payload: null }]) {
      const r = await call("/api/jobs/enqueue", { secret: "k", body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("passes a valid job through with its payload and production run id", async () => {
    const call = await boot({ N8N_WEBHOOK_SECRET: "k" });
    const r = await call("/api/jobs/enqueue", { secret: "k", body: { type: "sync.generate_batch", payload: { n: 3 }, productionRunId: "run-1" } });
    expect(await r.json()).toEqual({ jobId: "job-1" });
    expect(enqueueJob).toHaveBeenCalledWith("sync.generate_batch", { n: 3 }, { productionRunId: "run-1" });
  });
});
