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
        metadata: { ...meta, qaStatus: "approved", curationQueue: false },
      })
      .eq("id", body.itemId);

    const workerUrl = process.env.WORKER_API_URL ?? "http://localhost:3001";
    const secret = process.env.N8N_WEBHOOK_SECRET;
    try {
      await fetch(`${workerUrl}/api/jobs/enqueue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-n8n-secret": secret } : {}),
        },
        body: JSON.stringify({
          type: "sync.upload_track",
          payload: { trackIds: [body.itemId] },
        }),
      });
    } catch {
      /* worker may be offline */
    }
  } else if (body.queue === "hero_publish") {
    const { data: run } = await db
      .from("production_runs")
      .select("metadata")
      .eq("id", body.itemId)
      .single();
    const meta = (run?.metadata as Record<string, unknown>) ?? {};
    const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db
      .from("production_runs")
      .update({
        stage: "scheduled",
        metadata: { ...meta, scheduledAt: scheduled },
      })
      .eq("id", body.itemId);

    const workerUrl = process.env.WORKER_API_URL ?? "http://localhost:3001";
    const secret = process.env.N8N_WEBHOOK_SECRET;
    try {
      await fetch(`${workerUrl}/api/jobs/enqueue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-n8n-secret": secret } : {}),
        },
        body: JSON.stringify({
          type: "youtube.publish",
          productionRunId: body.itemId,
          payload: { runId: body.itemId },
        }),
      });
    } catch {
      /* worker may be offline */
    }
  } else if (body.queue === "supervisor_outreach") {
    await db
      .from("supervisor_outreach")
      .update({ status: "approved_for_send", sent_at: null })
      .eq("id", body.itemId);
  }

  return NextResponse.json({ ok: true });
}
