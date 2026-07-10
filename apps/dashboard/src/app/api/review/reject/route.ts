import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = (await req.json()) as { itemId: string; queue: string };
  const db = createServerSupabase();
  if (!db) {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (body.queue === "sync") {
    const { data: track } = await db
      .from("tracks")
      .select("metadata")
      .eq("id", body.itemId)
      .single();
    const meta = (track?.metadata as Record<string, unknown>) ?? {};
    await db
      .from("tracks")
      .update({
        deleted_at: new Date().toISOString(),
        metadata: {
          ...meta,
          qaStatus: "rejected",
          curationQueue: false,
          rejectedAt: new Date().toISOString(),
        },
      })
      .eq("id", body.itemId);
  } else if (body.queue === "hero_publish") {
    const { data: run } = await db
      .from("production_runs")
      .select("metadata")
      .eq("id", body.itemId)
      .single();
    const meta = (run?.metadata as Record<string, unknown>) ?? {};
    await db
      .from("production_runs")
      .update({
        stage: "failed",
        status: "failed",
        metadata: {
          ...meta,
          rejectedAt: new Date().toISOString(),
          rejectReason: "dan_rejected",
        },
      })
      .eq("id", body.itemId);
  } else if (body.queue === "supervisor_outreach") {
    await db
      .from("supervisor_outreach")
      .update({ status: "rejected" })
      .eq("id", body.itemId);
  }

  return NextResponse.json({ ok: true });
}
