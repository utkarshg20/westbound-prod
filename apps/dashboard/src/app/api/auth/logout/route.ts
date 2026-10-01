import { NextResponse, type NextRequest } from "next/server";
import { clearLocalSession, createRequestAuth, isSameOrigin, loginRedirect, loginUnavailable, noStore } from "../../../../lib/review-auth";

export async function POST(req: NextRequest) {
  let auth: ReturnType<typeof createRequestAuth> | undefined;
  let sameOrigin = false;
  try {
    sameOrigin = isSameOrigin(req);
    if (!sameOrigin) {
      return noStore(NextResponse.json({ error: "Same-origin request required" }, { status: 403 }));
    }
    auth = createRequestAuth(req);
    const { error } = await auth.client.auth.signOut({ scope: "local" });
    return clearLocalSession(req, auth.finish(loginRedirect(error ? "error=logout_incomplete" : "signed_out=1")));
  } catch {
    if (!sameOrigin) return loginUnavailable();
    const response = auth ? auth.finish(loginRedirect("error=logout_incomplete")) : loginUnavailable();
    return clearLocalSession(req, response);
  }
}
