import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, createLinkSender, isSameOrigin, loginRedirect, loginUnavailable, noStore } from "../../../../lib/review-auth";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) {
      return noStore(NextResponse.json({ error: "Same-origin request required" }, { status: 403 }));
    }
    const form = await req.formData();
    const email = String(form.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return loginRedirect("error=invalid_email");
    }
    const client = createLinkSender();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${appOrigin()}/auth/confirm`,
      },
    });
    // Account-specific results have identical status, location and cookies.
    // Only a service/transport failure is distinguished, never provider text.
    return loginRedirect(error && (error.status === undefined || error.status >= 500) ? "error=unavailable" : "sent=1");
  } catch {
    return loginUnavailable();
  }
}
