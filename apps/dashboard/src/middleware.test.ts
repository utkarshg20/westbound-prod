import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { middleware } from "./middleware";
import { POST as requestLink } from "./app/api/auth/magic-link/route";
import { GET as confirmLink } from "./app/auth/confirm/route";
import { POST as logout } from "./app/api/auth/logout/route";

// Auth protocol fixtures exercise the actual routes, Supabase SDK and SSR cookie
// implementation. No real email, Supabase service, or product-quality evaluation.
const origin = "https://studio.example.test";
const user = { id: "operator-id", aud: "authenticated", role: "authenticated", email: "operator@example.test" };
let calls: { path: string; method: string; body: Record<string, unknown>; authorization: string | null; url: URL }[];
let unexpected: string[];
let verifyStatus: number;
let userStatus: number;
let logoutStatus: number;
let otpStatus: number;
let refreshStatus: number;
let expiresIn: number;
let metadataSize: number;
let userResult: unknown;

function jwt(label: string) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, label })).toString("base64url"),
    "protocol-test-signature",
  ].join(".");
}
function session(label = "original", expires = expiresIn) {
  return {
    access_token: jwt(label), refresh_token: `${label}-refresh`, expires_in: expires,
    token_type: "bearer", user: { ...user, user_metadata: { note: "x".repeat(metadataSize) } },
  };
}
function request(path: string, options: { method?: string; cookie?: string; body?: BodyInit; origin?: string | null } = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? origin);
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequest(`${origin}${path}`, { method: options.method ?? "POST", headers, body: options.body });
}
function cookies(response: NextResponse) {
  return response.cookies.getAll().filter((cookie) => cookie.maxAge !== 0)
    .map(({ name, value }) => `${name}=${value}`).join("; ");
}
function expectPrivate(response: NextResponse) {
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
async function signedIn() {
  return confirmLink(request("/auth/confirm?token_hash=source-protocol-token&type=email", { method: "GET", origin: null }));
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("REQUIRE_DAN_AUTH", undefined);
  vi.stubEnv("SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  calls = [];
  unexpected = [];
  verifyStatus = userStatus = logoutStatus = otpStatus = refreshStatus = 200;
  expiresIn = 3600;
  metadataSize = 0;
  userResult = user;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    calls.push({ path: url.pathname, method, body, authorization: new Headers(init?.headers).get("authorization"), url });
    let status = 200;
    let result: unknown = {};
    if (url.pathname === "/auth/v1/otp") status = otpStatus;
    else if (url.pathname === "/auth/v1/verify") { status = verifyStatus; result = session(); }
    else if (url.pathname === "/auth/v1/user") { status = userStatus; result = userResult; }
    else if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      status = refreshStatus; result = session("refreshed", 3600);
    } else if (url.pathname === "/auth/v1/logout") status = logoutStatus;
    else { unexpected.push(`${method} ${url}`); status = 400; }
    if (status >= 400) result = { code: "invalid_token", msg: "Private provider detail" };
    return new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  expect(unexpected).toEqual([]);
});

describe("magic-link routes with the real Supabase SDK", () => {
  it("requests an existing-user link without storing sender-session cookies", async () => {
    const form = new FormData();
    form.set("email", " operator@example.test ");
    const response = await requestLink(request("/api/auth/magic-link", { body: form }));
    expect(response.headers.get("location")).toBe(`${origin}/login?sent=1`);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ email: user.email, create_user: false });
    expect(calls[0].url.searchParams.get("redirect_to")).toBe(`${origin}/auth/confirm`);
    expect(calls[0].body.code_challenge).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
    expectPrivate(response);
  });

  it("rejects malformed email before invoking Auth", async () => {
    const form = new FormData(); form.set("email", "invalid");
    const response = await requestLink(request("/api/auth/magic-link", { body: form }));
    expect(response.headers.get("location")).toBe(`${origin}/login?error=invalid_email`);
    expect(calls).toEqual([]);
  });

  it.each([400, 401, 403, 422, 429])("returns the same response for known and unknown/account-error outcomes (%i)", async (status) => {
    const send = () => {
      const form = new FormData(); form.set("email", user.email);
      return requestLink(request("/api/auth/magic-link", { body: form }));
    };
    const known = await send();
    otpStatus = status;
    const unknown = await send();
    expect(unknown.status).toBe(known.status);
    expect([...unknown.headers]).toEqual([...known.headers]);
    expect(await unknown.text()).toBe(await known.text());
    expect(unknown.cookies.getAll()).toEqual([]);
    expect(unknown.headers.get("location")).toBe(`${origin}/login?sent=1`);
    expectPrivate(unknown);
  });

  it("reports a service outage with a generic message", async () => {
    otpStatus = 500;
    const form = new FormData(); form.set("email", user.email);
    const response = await requestLink(request("/api/auth/magic-link", { body: form }));
    expect(response.headers.get("location")).toBe(`${origin}/login?error=unavailable`);
  });

  it.each(["", "?type=email", "?token_hash=token&type=recovery"])("rejects incomplete or wrong-purpose links: %s", async (query) => {
    const response = await confirmLink(request(`/auth/confirm${query}`, { method: "GET" }));
    expect(response.headers.get("location")).toBe(`${origin}/login?error=invalid_link`);
    expect(calls).toEqual([]);
  });

  it.each([400, 403])("shows a safe error for an invalid, expired, or consumed link (%i)", async (status) => {
    verifyStatus = status;
    const response = await signedIn();
    expect(response.headers.get("location")).toBe(`${origin}/login?error=invalid_link`);
    expect(cookies(response)).toBe("");
    expectPrivate(response);
  });

  it("distinguishes a confirmation service outage from an invalid link", async () => {
    verifyStatus = 500;
    const response = await signedIn();
    expect(response.headers.get("location")).toBe(`${origin}/login?error=unavailable`);
    expect(cookies(response)).toBe("");
    expectPrivate(response);
  });

  it("sets secure server-only session cookies and ignores arbitrary redirect targets", async () => {
    const response = await confirmLink(request("/auth/confirm?token_hash=source-protocol-token&type=email&next=https://other.example&redirect_to=https://other.example", { method: "GET" }));
    expect(response.headers.get("location")).toBe(`${origin}/review`);
    expect(calls[0].body).toMatchObject({ token_hash: "source-protocol-token", type: "email" });
    const stored = response.cookies.getAll().filter((cookie) => cookie.maxAge !== 0);
    expect(stored.length).toBeGreaterThan(0);
    for (const cookie of stored) {
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
      expect(cookie.domain).toBeUndefined();
    }
    expectPrivate(response);
  });

  it("preserves SDK cookie chunking through a subsequent verified mutation", async () => {
    metadataSize = 9000;
    const confirmed = await signedIn();
    expect(confirmed.cookies.getAll().filter((cookie) => cookie.name.startsWith("westbound-review.")).length).toBeGreaterThan(1);
    const response = await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(calls.at(-1)?.path).toBe("/auth/v1/user");
  });
});

describe("verified review mutations and refresh", () => {
  it.each(["approve", "reject", "master-upload"])("protects %s with auth unset", async (route) => {
    expect((await middleware(request(`/api/review/${route}`))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it.each(["true", "", "TRUE", "0"])("does not disable authentication for %j", async (setting) => {
    vi.stubEnv("REQUIRE_DAN_AUTH", setting);
    expect((await middleware(request("/api/review/approve"))).status).toBe(401);
  });

  it("retains the explicit isolated-demo opt-out", async () => {
    vi.stubEnv("REQUIRE_DAN_AUTH", "false");
    expect((await middleware(request("/api/review/approve"))).headers.get("x-middleware-next")).toBe("1");
    expect(calls).toEqual([]);
  });

  it.each([["/api/review/approve", "GET"], ["/review", "GET"], ["/api/auth/magic-link", "POST"]])("leaves %s %s outside this gate", async (path, method) => {
    expect((await middleware(request(path, { method }))).headers.get("x-middleware-next")).toBe("1");
    expect(calls).toEqual([]);
  });

  it.each(["westbound-review=forged", "sb-access-token=forged", "sb-auth-token=forged"])("does not authenticate a forged or legacy cookie: %s", async (cookie) => {
    expect((await middleware(request("/api/review/approve", { cookie }))).status).toBe(401);
  });

  it("uses the server database project's URL", async () => {
    vi.stubEnv("SUPABASE_URL", "https://server-project.supabase.co");
    const confirmed = await signedIn();
    await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(calls.every((call) => call.url.origin === "https://server-project.supabase.co")).toBe(true);
  });

  it("revalidates the user with Auth rather than trusting the cookie's user object", async () => {
    const confirmed = await signedIn(); userStatus = 401;
    const response = await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(response.status).toBe(401);
    expect(calls.at(-1)?.authorization).toBe(`Bearer ${jwt("original")}`);
    expectPrivate(response);
  });

  it("requires a user ID even in an error-free but malformed Auth response", async () => {
    const confirmed = await signedIn(); userResult = {};
    expect((await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }))).status).toBe(401);
  });

  it("reports Auth service failure without treating it as an expired login", async () => {
    const confirmed = await signedIn(); userStatus = 500;
    expect((await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }))).status).toBe(503);
  });

  it("refreshes an expired session and propagates new cookies to browser and downstream", async () => {
    expiresIn = -60;
    const confirmed = await signedIn();
    const response = await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(calls.find((call) => call.path === "/auth/v1/token")?.body.refresh_token).toBe("original-refresh");
    expect(calls.at(-1)?.authorization).toBe(`Bearer ${jwt("refreshed")}`);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(cookies(response)).not.toBe("");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("westbound-review");
    expectPrivate(response);
  });

  it("preserves refreshed cookies when subsequent verification denies the user", async () => {
    expiresIn = -60; const confirmed = await signedIn(); userStatus = 401;
    const response = await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(response.status).toBe(401);
    expect(cookies(response)).not.toBe("");
    expectPrivate(response);
  });

  it("clears a rejected refresh session and blocks the mutation", async () => {
    expiresIn = -60; const confirmed = await signedIn(); refreshStatus = 400;
    const response = await middleware(request("/api/review/approve", { cookie: cookies(confirmed) }));
    expect(response.status).toBe(401);
    expect(response.cookies.getAll().some((cookie) => cookie.maxAge === 0)).toBe(true);
    expectPrivate(response);
  });
});

describe("logout and configuration boundaries", () => {
  it("revokes only this session, clears the browser cookies and denies the next mutation", async () => {
    const confirmed = await signedIn();
    const response = await logout(request("/api/auth/logout", { cookie: cookies(confirmed) }));
    expect(response.headers.get("location")).toBe(`${origin}/login?signed_out=1`);
    expect(calls.find((call) => call.path === "/auth/v1/logout")?.url.searchParams.get("scope")).toBe("local");
    expect(response.cookies.getAll().some((cookie) => cookie.maxAge === 0)).toBe(true);
    expect((await middleware(request("/api/review/approve", { cookie: cookies(response) }))).status).toBe(401);
    expectPrivate(response);
  });

  it("clears local cookies without claiming remote logout when Auth fails", async () => {
    const confirmed = await signedIn(); logoutStatus = 500;
    const response = await logout(request("/api/auth/logout", { cookie: cookies(confirmed) }));
    expect(response.headers.get("location")).toBe(`${origin}/login?error=logout_incomplete`);
    expect(response.cookies.getAll().some((cookie) => cookie.maxAge === 0)).toBe(true);
    expectPrivate(response);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])("fails closed when %s is missing", async (name) => {
    vi.stubEnv(name, undefined);
    expect((await middleware(request("/api/review/approve"))).status).toBe(503);
    expect((await signedIn()).headers.get("location")).toBe(`${origin}/login?error=unavailable`);
    expect(calls).toEqual([]);
  });

  it.each([undefined, "http://studio.example.test", "https://user:password@studio.example.test", "javascript:invalid"])("rejects an unsafe production application URL: %s", async (url) => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_APP_URL", url);
    expect((await middleware(request("/api/review/approve"))).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it.each([null, "https://other.example"])("rejects missing or foreign Origin (%s) on all cookie-backed mutation routes", async (requestOrigin) => {
    const confirmed = await signedIn(); calls = [];
    for (const [handler, path] of [[middleware, "/api/review/approve"], [logout, "/api/auth/logout"], [requestLink, "/api/auth/magic-link"]] as const) {
      const response = await handler(request(path, { cookie: cookies(confirmed), origin: requestOrigin }));
      expect(response.status).toBe(403);
      expect(response.cookies.getAll()).toEqual([]);
    }
    expect(calls).toEqual([]);
  });
});
