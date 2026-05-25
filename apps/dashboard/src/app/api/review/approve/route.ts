import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = (await req.json()) as { itemId: string; queue: string };
  const db = createServerSupabase();
  if (!db) {
    return NextResponse.json({ ok: true, demo: true });
  }

  if (body.queue === "sync") {
    await db
      .from("tracks")
      .update({
        metadata: { qaStatus: "approved", curationQueue: false },
      })
      .eq("id", body.itemId);
  } else if (body.queue === "hero_publish") {
    const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db
      .from("production_runs")
      .update({
        stage: "scheduled",
        metadata: { scheduledAt: scheduled },
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
      /* worker may be offline; stage still updated */
    }
  }

  return NextResponse.json({ ok: true });
}
