import { NextResponse, type NextRequest } from "next/server";
import { authUnavailable, createRequestAuth, isSameOrigin, noStore } from "./lib/review-auth";

/** The existing authenticated-project-user policy, not a Dan-only role. */
export async function middleware(req: NextRequest) {
  if (process.env.REQUIRE_DAN_AUTH === "false") return NextResponse.next();
  if (!req.nextUrl.pathname.startsWith("/api/review/") || req.method === "GET") {
    return NextResponse.next();
  }

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
    // Include refreshed request cookies for any downstream session consumers.
    return auth.finish(NextResponse.next({ request: req }));
  } catch {
    return auth ? auth.finish(authUnavailable()) : authUnavailable();
  }
}

export const config = { matcher: ["/api/review/:path*"] };
