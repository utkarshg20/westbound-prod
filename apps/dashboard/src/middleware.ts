import { NextResponse, type NextRequest } from "next/server";
import { authUnavailable, createRequestAuth, isSameOrigin, noStore } from "./lib/review-auth";

/**
 * Every non-GET dashboard API needs this gate. /api/auth/* handles sign-in and
 * sign-out and checks Origin itself; pages are outside this gate. No dashboard
 * API is called server-to-server (n8n and scripts call the worker), so no
 * machine credential is accepted here.
 */
function requiresVerifiedSession(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  return req.method !== "GET" && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/");
}

/** The existing authenticated-project-user policy, not a Dan-only role. */
export async function middleware(req: NextRequest) {
  if (process.env.REQUIRE_DAN_AUTH === "false") return NextResponse.next();
  if (!requiresVerifiedSession(req)) return NextResponse.next();

  let auth: ReturnType<typeof createRequestAuth> | undefined;
  try {
    if (!isSameOrigin(req)) {
      return noStore(NextResponse.json({ error: "Same-origin request required" }, { status: 403 }));
    }
    auth = createRequestAuth(req);
    // The SDK refreshes expired sessions and verifies the user with Supabase Auth.
    const { data, error } = await auth.client.auth.getUser();
    if (error && (error.status === undefined || error.status >= 500)) {
      return auth.finish(authUnavailable());
    }
    if (error || !data.user?.id) {
      return auth.finish(NextResponse.json(
        { error: "Invalid or expired session — sign in at /login" },
        { status: 401 }
      ));
    }
    // Forward the verified email so routes can enforce role restrictions.
    const forwarded = new Headers(req.headers);
    if (data.user.email) forwarded.set("x-session-email", data.user.email);
    return auth.finish(NextResponse.next({ request: { headers: forwarded } }));
  } catch {
    return auth ? auth.finish(authUnavailable()) : authUnavailable();
  }
}

// Keep /api/auth/* and pages out of the middleware entirely.
export const config = { matcher: ["/api/((?!auth/).*)"] };
