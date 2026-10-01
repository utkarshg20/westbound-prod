import { clearAuthCookiesAtScopes, createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// This server-only session is separate from the service-role data client.
const SESSION_COOKIE = "westbound-review";

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL is required");
  }
  const url = new URL(configured ?? "http://localhost:3000");
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("Invalid application origin");
  }
  return url.origin;
}

export function isSameOrigin(req: NextRequest): boolean {
  return req.headers.get("origin") === appOrigin();
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function loginRedirect(query: string): NextResponse {
  return noStore(NextResponse.redirect(new URL(`/login?${query}`, appOrigin()), 303));
}

export function authUnavailable(): NextResponse {
  return noStore(NextResponse.json({ error: "Review authentication is not configured or unavailable" }, { status: 503 }));
}

export function loginUnavailable(): NextResponse {
  try {
    return loginRedirect("error=unavailable");
  } catch {
    return authUnavailable();
  }
}

function authConnection() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured");
  return { url, key };
}

/** Token-hash email confirmation needs no browser verifier or sender session. */
export function createLinkSender() {
  const { url, key } = authConnection();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createRequestAuth(req: NextRequest) {
  const { url, key } = authConnection();
  const writes = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const headers: Record<string, string> = {};
  const client = createServerClient(url, key, {
    cookieOptions: {
      name: SESSION_COOKIE,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(appOrigin()).protocol === "https:",
    },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(cookies, cacheHeaders) {
        for (const cookie of cookies) {
          req.cookies.set(cookie.name, cookie.value);
          writes.set(cookie.name, cookie);
        }
        Object.assign(headers, cacheHeaders);
      },
    },
  });
  return {
    client,
    finish(response: NextResponse): NextResponse {
      for (const { name, value, options } of writes.values()) {
        response.cookies.set(name, value, options);
      }
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return noStore(response);
    },
  };
}

/** Clear this browser even when remote logout fails; do not claim server revocation. */
export async function clearLocalSession(req: NextRequest, response: NextResponse) {
  for (const storageKey of [SESSION_COOKIE, `${SESSION_COOKIE}-code-verifier`]) {
    await clearAuthCookiesAtScopes({
      getAll: () => req.cookies.getAll(),
      setAll(cookies) {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
      storageKey,
      scopes: [{ path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }],
    });
  }
  return noStore(response);
}
