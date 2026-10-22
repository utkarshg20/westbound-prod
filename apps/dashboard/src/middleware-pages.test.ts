import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

// Without a session cookie the Supabase SDK answers "session missing" locally, so no network is involved.
const origin = "https://studio.example.test";
const saved = { ...process.env };
const get = (path: string, method = "GET") => new NextRequest(`${origin}${path}`, { method });

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  delete process.env.REQUIRE_DAN_AUTH;
});
afterEach(() => { process.env = { ...saved }; });

describe("page gate", () => {
  it.each(["/", "/ops", "/review", "/revenue"])("%s without a session redirects to /login", async (path) => {
    const res = await middleware(get(path));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("a HEAD request is gated too", async () => {
    expect((await middleware(get("/revenue", "HEAD"))).status).toBe(303);
  });

  it("when sign-in is not configured the page says so instead of rendering", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await middleware(get("/ops"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?error=unavailable");
  });

  it("a non-GET page request needs same origin first", async () => {
    expect((await middleware(get("/ops", "POST"))).status).toBe(403);
  });

  it("APIs still answer with JSON, not a redirect", async () => {
    const res = await middleware(new NextRequest(`${origin}/api/ops/dlq-retry`, { method: "POST", headers: { origin } }));
    expect(res.status).toBe(401);
  });
});
