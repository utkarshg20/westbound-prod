import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory dead_letter_jobs; delete().select() returns and removes the row atomically, like Postgres.
const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  enqueued: [] as unknown[][],
  enqueueFails: false,
  claimError: null as { message: string } | null,
}));

vi.mock("@westbound/platform", () => ({
  JobTypeSchema: {
    safeParse: (v: unknown) => (["youtube.publish", "sync.generate_batch"].includes(String(v)) ? { success: true, data: v } : { success: false }),
  },
  enqueueJob: vi.fn(async (...args: unknown[]) => {
    if (state.enqueueFails) throw new Error("redis secret-host:6379 refused");
    state.enqueued.push(args);
    return "job-9";
  }),
  createSupabaseAdmin: () => ({
    from: () => ({
      delete: () => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            maybeSingle: async () => {
              if (state.claimError) return { data: null, error: state.claimError };
              const row = state.rows.get(id) ?? null;
              state.rows.delete(id);
              return { data: row, error: null };
            },
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        state.rows.set(String(row.id), row);
        return { error: null };
      },
    }),
  }),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new Request("https://x.test/api/ops/dlq-retry", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const row = (over: Record<string, unknown> = {}) => ({ id: "d1", job_type: "youtube.publish", payload: { runId: "r1" }, production_run_id: "r1", ...over });

beforeEach(() => {
  state.rows = new Map([["d1", row()]]);
  state.enqueued = [];
  state.enqueueFails = false;
  state.claimError = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("dlq-retry", () => {
  it("re-queues a job once and removes the row", async () => {
    const res = await post({ dlqId: "d1" });
    expect(await res.json()).toEqual({ ok: true, jobId: "job-9" });
    expect(state.enqueued).toHaveLength(1);
    expect(state.rows.size).toBe(0);
  });

  it("two clicks at once enqueue the job exactly once", async () => {
    const [a, b] = await Promise.all([post({ dlqId: "d1" }), post({ dlqId: "d1" })]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    expect(state.enqueued).toHaveLength(1);
  });

  it("puts the row back when the enqueue fails, with a generic error that leaks no internals", async () => {
    state.enqueueFails = true;
    const res = await post({ dlqId: "d1" });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/redis|secret-host|6379/);
    expect(state.rows.has("d1")).toBe(true);
  });

  it("puts the row back for an unknown job type and refuses it", async () => {
    state.rows.set("d1", row({ job_type: "rm.rf" }));
    const res = await post({ dlqId: "d1" });
    expect(res.status).toBe(400);
    expect(state.rows.has("d1")).toBe(true);
    expect(state.enqueued).toEqual([]);
  });

  it("404 for a missing row, 400 for a malformed body, generic 500 for a database error", async () => {
    expect((await post({ dlqId: "nope" })).status).toBe(404);
    expect((await post("not json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ dlqId: 7 })).status).toBe(400);
    state.claimError = { message: "relation dead_letter_jobs leaked detail" };
    const res = await post({ dlqId: "d1" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/leaked detail/);
  });
});
