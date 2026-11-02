import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, authUnavailable, createRequestAuth, isSameOrigin, loginUnavailable, noStore } from "./lib/review-auth";

/**
 * Every non-GET dashboard API needs this gate, and so does every page: the pages read the
 * pipeline, review queue and revenue with the service-role key, so without a session they
 * would show that data to anyone with the URL. A page request without a session is sent to
 * /login. /api/auth/*, /auth/confirm and /login are the sign-in flow and stay open
 * (/api/auth/* checks Origin itself). No dashboard API is called server-to-server (n8n and
 * scripts call the worker), so no machine credential is accepted here.
 */
function isPageRequest(req: NextRequest): boolean {
  return !req.nextUrl.pathname.startsWith("/api/");
}

function requiresVerifiedSession(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  return req.method !== "GET" && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/");
}

/**
 * The request headers routes see. A client can send any header it likes, so x-session-email is always stripped
 * first and only set from the verified session. (A session without an email used to pass the client's own
 * x-session-email through, which let it claim to be the reviewer.)
 */
export function forwardSessionHeaders(incoming: Headers, verifiedEmail: string | null | undefined): Headers {
  const forwarded = new Headers(incoming);
  forwarded.delete("x-session-email");
  if (verifiedEmail) forwarded.set("x-session-email", verifiedEmail);
  return forwarded;
}

/** The existing authenticated-project-user policy, not a Dan-only role. */
export async function middleware(req: NextRequest) {
  // The demo opt-out exists for local work only: in production the gate is always on.
  if (process.env.REQUIRE_DAN_AUTH === "false" && process.env.NODE_ENV !== "production") return NextResponse.next();
  const page = isPageRequest(req);
  if (!page && !requiresVerifiedSession(req)) return NextResponse.next();

  let auth: ReturnType<typeof createRequestAuth> | undefined;
  try {
    // A page navigation carries no Origin header; only state-changing requests are checked.
    if ((!page || (req.method !== "GET" && req.method !== "HEAD")) && !isSameOrigin(req)) {
      return noStore(NextResponse.json({ error: "Same-origin request required" }, { status: 403 }));
    }
    auth = createRequestAuth(req);
    // The SDK refreshes expired sessions and verifies the user with Supabase Auth.
    const { data, error } = await auth.client.auth.getUser();
    if (error && (error.status === undefined || error.status >= 500)) {
      return auth.finish(page ? loginUnavailable() : authUnavailable());
    }
    if (error || !data.user?.id) {
      if (page) return auth.finish(noStore(NextResponse.redirect(new URL("/login", appOrigin()), 303)));
      return auth.finish(NextResponse.json(
        { error: "Invalid or expired session — sign in at /login" },
        { status: 401 }
      ));
    }
    // Forward the verified email so routes can enforce role restrictions.
    return auth.finish(NextResponse.next({ request: { headers: forwardSessionHeaders(req.headers, data.user.email) } }));
  } catch {
    const unavailable = page ? loginUnavailable() : authUnavailable();
    return auth ? auth.finish(unavailable) : unavailable;
  }
}

// APIs outside /api/auth/*, and every page except the sign-in flow and Next's own assets.
export const config = {
  matcher: ["/api/((?!auth/).*)", "/((?!api/|_next/|auth/|login(?:/|$)|favicon\\.ico$).*)"],
};
