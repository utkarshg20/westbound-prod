import { NextResponse } from "next/server";
import { findPublishMediaUri } from "@westbound/platform";
import { createServerSupabase } from "@/lib/supabase";
import {
  databaseError,
  enqueueWorkerJob,
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
    return reviewError(403, "only the designated reviewer can approve hero_publish runs");
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
        metadata: { ...meta, qaStatus: "approved", curationQueue: false },
      })
      .eq("id", body.itemId);
    if (updErr) return databaseError("approving the track", updErr);

    // Unchanged behaviour: the sync upload is best-effort; the worker may be offline.
    await enqueueWorkerJob({
      type: "sync.upload_track",
      payload: { trackIds: [body.itemId] },
    });
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
      return reviewError(409, `run is in stage ${run.stage}; only dan_review runs can be approved`, {
        stage: run.stage,
      });
    }
    if (!findPublishMediaUri(run.metadata)) {
      return reviewError(
        409,
        "run has no resolveMasterUri or episodeVideoUri — upload the master before approving",
        { stage: run.stage }
      );
    }

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let scheduled;
    try {
      // Conditional dan_review -> scheduled; FSM-checked in the repository.
      scheduled = await repo.transitionProductionStage(body.itemId, "dan_review", "scheduled", {
        metadata: { ...run.metadata, scheduledAt },
        expectedUpdatedAt: run.updated_at,
      });
    } catch (err) {
      return databaseError("scheduling the production run", err);
    }
    if (!scheduled) {
      return reviewError(409, "run changed while it was being approved — reload and retry");
    }

    // Only a run that is now `scheduled` gets a publish job.
    const queued = await enqueueWorkerJob({
      type: "youtube.publish",
      productionRunId: body.itemId,
      payload: { runId: body.itemId },
    });
    if (!queued) {
      return reviewError(
        502,
        "run is scheduled but the youtube.publish job could not be queued — re-queue it from the worker",
        { stage: "scheduled", scheduledAt }
      );
    }
    return NextResponse.json({ ok: true, stage: "scheduled", scheduledAt });
  } else if (body.queue === "supervisor_outreach") {
    const { data, error } = await db
      .from("supervisor_outreach")
      .update({ status: "approved_for_send", sent_at: null })
      .eq("id", body.itemId)
      .select("id");
    if (error) return databaseError("approving the outreach draft", error);
    if (!data?.length) return reviewError(404, `outreach draft not found: ${body.itemId}`);
  }

  return NextResponse.json({ ok: true });
}
