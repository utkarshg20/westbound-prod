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
    const emailRedirectTo = `${appOrigin()}/auth/confirm`;
    const receipt = loginRedirect("sent=1");
    try {
      await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo },
      });
    } catch {
      // Provider failures can depend on whether an account was found.
      // Keep thrown failures indistinguishable from all returned Auth results.
    }
    return receipt;
  } catch {
    return loginUnavailable();
  }
}
