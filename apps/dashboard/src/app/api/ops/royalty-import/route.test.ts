import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as unknown[], throwsOnImport: false }));
vi.mock("@westbound/dsp", () => ({
  aggregateRoyaltiesCsv: vi.fn(async (rows: unknown[]) => {
    state.calls.push(rows);
    if (state.throwsOnImport) throw new Error("db password=hunter2 refused");
    return rows.length - 1; // pretend one duplicate was skipped
  }),
}));

const { POST } = await import("./route");
const post = (body: unknown) => POST(new Request("https://x.test/api/ops/royalty-import", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => { state.calls = []; state.throwsOnImport = false; vi.spyOn(console, "error").mockImplementation(() => undefined); });

describe("royalty-import route", () => {
  it("imports a valid file and reports how many duplicates were skipped", async () => {
    const res = await post({ csv: "platform,amount,month,track\nspotify,1,2026-09,t\napple,2,2026-09,t" });
    expect(await res.json()).toEqual({ imported: 1, skippedDuplicates: 1 });
  });
  it("writes nothing when any line is invalid, and says which", async () => {
    const res = await post({ csv: "h\nspotify,1,2026-09,t\nspotify,oops,2026-09,t" });
    expect(res.status).toBe(400);
    expect((await res.json()).problems[0]).toMatch(/line 3/);
    expect(state.calls).toEqual([]);
  });
  it("400 for a missing or non-string csv and for a body that is not JSON; no TypeError leaks", async () => {
    for (const body of [{}, { csv: 5 }, { csv: "  " }, "not json"]) expect((await post(body)).status).toBe(400);
  });
  it("a failed import returns a generic error, never the exception text", async () => {
    state.throwsOnImport = true;
    const res = await post({ csv: "h\nspotify,1,2026-09,t" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/hunter2|password/);
  });
});
