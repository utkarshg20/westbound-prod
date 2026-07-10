import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Scaffold: send Supabase magic link when Auth is configured */
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!url || !anon || !email) {
    return NextResponse.redirect(
      new URL("/login?error=not_configured", appUrl),
      { status: 303 }
    );
  }

  const supabase = createClient(url, anon);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl}/review` },
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, appUrl),
      { status: 303 }
    );
  }

  return NextResponse.redirect(new URL("/login?sent=1", appUrl), { status: 303 });
}
