import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  databaseError,
  invalidItemId,
  parseReviewDecision,
  reviewError,
  reviewRepository,
} from "@/lib/review-decision";

function reviewerAllowed(req: Request, queue: string): boolean {
  const reviewerEmail = process.env.REVIEWER_EMAIL;
  if (!reviewerEmail || queue !== "hero_publish") return true;
  const callerEmail = new Headers(req.headers).get("x-session-email");
  return callerEmail === reviewerEmail;
}

export async function POST(req: Request) {
  const parsed = await parseReviewDecision(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const db = createServerSupabase();
  if (!db) {
    return NextResponse.json({ ok: true, demo: true });
  }
  const badId = invalidItemId(body.itemId);
  if (badId) return badId;

  if (!reviewerAllowed(req, body.queue)) {
    return reviewError(403, "only the designated reviewer can reject hero_publish runs");
  }

  if (body.queue === "sync") {
    const { data: track, error: loadErr } = await db
      .from("tracks")
      .select("metadata")
      .eq("id", body.itemId)
      .maybeSingle();
    if (loadErr) return databaseError("loading the track", loadErr);
    if (!track) return reviewError(404, `track not found: ${body.itemId}`);
    const meta = (track.metadata as Record<string, unknown>) ?? {};
    const { error: updErr } = await db
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
    if (updErr) return databaseError("rejecting the track", updErr);
  } else if (body.queue === "hero_publish") {
    const repo = reviewRepository(db);
    let run;
    try {
      run = await repo.getProductionRun(body.itemId);
    } catch (err) {
      return databaseError("loading the production run", err);
    }
    if (!run) return reviewError(404, `run not found: ${body.itemId}`);
    if (run.stage !== "dan_review") {
      return reviewError(409, `run is in stage ${run.stage}; only dan_review runs can be rejected`, {
        stage: run.stage,
      });
    }
    let failed;
    try {
      // Conditional dan_review -> failed; FSM-checked in the repository.
      failed = await repo.transitionProductionStage(body.itemId, "dan_review", "failed", {
        status: "failed",
        metadata: {
          ...run.metadata,
          rejectedAt: new Date().toISOString(),
          rejectReason: "dan_rejected",
        },
        expectedUpdatedAt: run.updated_at,
      });
    } catch (err) {
      return databaseError("rejecting the production run", err);
    }
    if (!failed) {
      return reviewError(409, "run changed while it was being rejected — reload and retry");
    }
  } else if (body.queue === "supervisor_outreach") {
    const { data, error } = await db
      .from("supervisor_outreach")
      .update({ status: "rejected" })
      .eq("id", body.itemId)
      .select("id");
    if (error) return databaseError("rejecting the outreach draft", error);
    if (!data?.length) return reviewError(404, `outreach draft not found: ${body.itemId}`);
  }

  return NextResponse.json({ ok: true });
}
