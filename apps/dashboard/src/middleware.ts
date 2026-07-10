import { NextResponse, type NextRequest } from "next/server";

/**
 * Soft auth gate scaffolding.
 * When REQUIRE_DAN_AUTH=true, review mutation APIs need a session cookie.
 * Default off so local stub/demo mode keeps working.
 */
export function middleware(req: NextRequest) {
  if (process.env.REQUIRE_DAN_AUTH !== "true") {
    return NextResponse.next();
  }

  const isReviewMutation =
    req.nextUrl.pathname.startsWith("/api/review/") &&
    req.method !== "GET";

  if (!isReviewMutation) return NextResponse.next();

  const hasSession =
    Boolean(req.cookies.get("sb-access-token")?.value) ||
    Boolean(req.cookies.get("sb-auth-token")?.value);

  if (!hasSession) {
    return NextResponse.json(
      { error: "Dan auth required — sign in at /login" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/review/:path*"],
};
