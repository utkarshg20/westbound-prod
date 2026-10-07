import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// Mechanical route tests: the real Supabase SDK talks to an in-memory double.
// R2 / AssetStorage is not configured, so uploads fall back to local://.
const DB = "https://db.example.test";
const PROJECT_ID = "aaaaaaaa-0000-4000-8000-000000000001";

type DbCall = { method: string; table: string; url: URL; body: Record<string, unknown> | null };

let dbCalls: DbCall[];
let unexpected: string[];
let projects: { id: string; slug: string }[];
let assets: { version: number; r2_uri: string }[];
let insertError: { code: string; message: string } | null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function upload(file: File, extra?: { filename?: string }) {
  const form = new FormData();
  form.set("file", file);
  if (extra?.filename) form.set("filename", extra.filename);
  return POST(
    new Request("https://studio.example.test/api/refs/upload", {
      method: "POST",
      body: form,
    })
  );
}

function imageFile(name = "hero_ref.png", size = 200_000): File {
  return new File([new Uint8Array(size).fill(1)], name, { type: "image/png" });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", DB);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  // No R2 env vars → AssetStorage.fromEnv() throws → route uses local:// stub
  dbCalls = [];
  unexpected = [];
  projects = [{ id: PROJECT_ID, slug: "studio" }];
  assets = [];
  insertError = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      if (url.origin !== DB) {
        unexpected.push(`${method} ${url}`);
        return json({ message: "unexpected" }, 400);
      }
      const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
      if (!table) {
        unexpected.push(`${method} ${url}`);
        return json({ message: "unexpected" }, 400);
      }
      dbCalls.push({ method, table, url, body });
      if (table === "projects" && method === "GET") {
        return json(projects.filter((p) => url.searchParams.get("slug") === `eq.${p.slug}`));
      }
      if (table === "assets" && method === "GET") {
        return json(assets);
      }
      if (table === "assets" && method === "POST") {
        if (insertError) return json(insertError, 409);
        return json([], 201);
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

describe("POST /api/refs/upload", () => {
  it("returns demo:true when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await upload(imageFile());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo: true });
    expect(dbCalls).toEqual([]);
  });

  it("returns 400 when no file is in the form body", async () => {
    const res = await POST(
      new Request("https://studio.example.test/api/refs/upload", {
        method: "POST",
        body: new FormData(),
      })
    );
    expect(res.status).toBe(400);
  });

  it("uploads successfully and returns ok:true with type and tags", async () => {
    const res = await upload(imageFile("dan_ref_front.png"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, type: "image" });
    expect(body.filename).toMatch(/dan_ref_front/);
  });

  it("assigns version 1 when no assets exist for the entity", async () => {
    assets = [];
    await upload(imageFile("first_ref.png"));
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body?.version).toBe(1);
  });

  it("assigns version max+1 when assets already exist for the entity", async () => {
    assets = [
      { version: 3, r2_uri: "local://studio/sammy_rane/v3/old.png" },
      { version: 1, r2_uri: "local://studio/sammy_rane/v1/older.png" },
    ];
    await upload(imageFile("new_ref.png"));
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body?.version).toBe(4);
  });

  it("ignores assets from other entities when computing the version", async () => {
    assets = [
      { version: 9, r2_uri: "local://studio/other_entity/v9/something.png" },
    ];
    await upload(imageFile("my_ref.png"));
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body?.version).toBe(1);
  });

  it("uploads directly (no worker call) — db calls are projects + assets GET + assets POST", async () => {
    await upload(imageFile("hero.png"));
    const tables = dbCalls.map((c) => `${c.method}:${c.table}`);
    expect(tables).toContain("GET:projects");
    expect(tables).toContain("GET:assets");
    expect(tables).toContain("POST:assets");
    // No worker calls — the test mock returns unexpected for non-DB origins
  });

  it("sets qa_status to pending and project_id on the inserted asset", async () => {
    await upload(imageFile("qa_test.png"));
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body).toMatchObject({
      project_id: PROJECT_ID,
      qa_status: "pending",
      type: "image",
    });
  });

  it("stores a local:// r2_uri when R2 is not configured", async () => {
    await upload(imageFile("stub_ref.png"));
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(String(insert?.body?.r2_uri)).toMatch(/^local:\/\//);
  });

  it("accepts large files — no 75-KB base64 limit", async () => {
    const res = await upload(imageFile("large_ref.png", 2_000_000)); // 2 MB
    expect(res.status).toBe(200);
  });

  it("returns 500 when the project is not found", async () => {
    projects = [];
    const res = await upload(imageFile("ref.png"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("studio") });
  });

  it("returns 500 when the asset insert fails", async () => {
    insertError = { code: "23503", message: "foreign key violation" };
    const res = await upload(imageFile("ref.png"));
    expect(res.status).toBe(500);
  });

  it("infers type=audio from content-type", async () => {
    const f = new File([new Uint8Array(100)], "vocal_stem.wav", { type: "audio/wav" });
    const res = await upload(f);
    expect(res.status).toBe(200);
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body?.type).toBe("audio");
  });

  it("infers type=video from content-type", async () => {
    const f = new File([new Uint8Array(100)], "motion_clip.mp4", { type: "video/mp4" });
    const res = await upload(f);
    expect(res.status).toBe(200);
    const insert = dbCalls.find((c) => c.table === "assets" && c.method === "POST");
    expect(insert?.body?.type).toBe("video");
  });

  it("sanitises the filename for the asset key", async () => {
    const f = new File([new Uint8Array(100)], "my ref (1).png", { type: "image/png" });
    const res = await upload(f, { filename: "my ref (1).png" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).not.toMatch(/[ ()]/);
  });
});
