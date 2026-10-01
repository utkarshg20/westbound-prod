import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, createRequestAuth, loginRedirect, loginUnavailable } from "../../../lib/review-auth";

export async function GET(req: NextRequest) {
  let auth: ReturnType<typeof createRequestAuth> | undefined;
  try {
    const tokenHash = req.nextUrl.searchParams.get("token_hash");
    if (!tokenHash || tokenHash.length > 2048 || req.nextUrl.searchParams.get("type") !== "email") {
      return loginRedirect("error=invalid_link");
    }
    auth = createRequestAuth(req);
    const { data, error } = await auth.client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error && (error.status === undefined || error.status >= 500)) return auth.finish(loginUnavailable());
    if (error || !data.session || !data.user?.id) return auth.finish(loginRedirect("error=invalid_link"));
    // Ignore caller-supplied redirect destinations and remove the token from the URL.
    return auth.finish(NextResponse.redirect(new URL("/review", appOrigin()), 303));
  } catch {
    return auth ? auth.finish(loginUnavailable()) : loginUnavailable();
  }
}
