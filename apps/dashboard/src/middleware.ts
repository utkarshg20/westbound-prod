import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Review mutations require a token verified by this project's Supabase Auth.
 * Explicitly set REQUIRE_DAN_AUTH=false only for local stub/demo use.
 * This preserves the existing authenticated-project-user policy, not a Dan role.
 */
export async function middleware(req: NextRequest) {
  if (process.env.REQUIRE_DAN_AUTH === "false") {
    return NextResponse.next();
  }

  const isReviewMutation =
    req.nextUrl.pathname.startsWith("/api/review/") &&
    req.method !== "GET";

  if (!isReviewMutation) return NextResponse.next();

  const accessToken =
    req.cookies.get("sb-access-token")?.value ||
    req.cookies.get("sb-auth-token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Authentication required — sign in at /login" },
      { status: 401 }
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Review authentication is not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    // Cookie presence and locally decoded claims are not authentication.
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid or expired session — sign in at /login" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { error: "Review authentication is unavailable" },
      { status: 503 }
    );
  }
}

export const config = {
  matcher: ["/api/review/:path*"],
};
