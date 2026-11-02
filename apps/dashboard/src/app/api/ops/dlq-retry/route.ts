import { createSupabaseAdmin, enqueueJob, JobTypeSchema } from "@westbound/platform";
import { NextResponse } from "next/server";

/**
 * Re-queue one dead-letter job.
 *
 * The row is CLAIMED first (deleted, returning it), then enqueued, and put back if anything fails. It used to
 * select, enqueue and then delete, so two concurrent clicks (or two tabs) both read the row and both enqueued the job:
 * a double run of work that can spend provider credits or publish. Errors are generic to the caller and detailed in
 * the log.
 */
export async function POST(req: Request) {
  let dlqId: string;
  try {
    const body = (await req.json()) as { dlqId?: unknown };
    if (typeof body?.dlqId !== "string" || !body.dlqId) throw new Error("dlqId required");
    dlqId = body.dlqId;
  } catch {
    return NextResponse.json({ error: "dlqId required" }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const { data: row, error } = await db
    .from("dead_letter_jobs")
    .delete()
    .eq("id", dlqId)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[dlq-retry] claim failed", { dlqId, error: error.message });
    return NextResponse.json({ error: "Could not retry this job" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "DLQ row not found (already retried?)" }, { status: 404 });
  }

  const putBack = async () => {
    const { error: restoreError } = await db.from("dead_letter_jobs").insert(row);
    if (restoreError) console.error("[dlq-retry] could not restore the row", { dlqId, error: restoreError.message });
  };

  const parsed = JobTypeSchema.safeParse(String(row.job_type));
  if (!parsed.success) {
    await putBack();
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }

  const payload = (row.payload as Record<string, unknown>) ?? {};
  try {
    const jobId = await enqueueJob(parsed.data, payload, {
      productionRunId: row.production_run_id ?? undefined,
    });
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    console.error("[dlq-retry] enqueueJob failed", {
      dlqId,
      jobType: parsed.data,
      error: err instanceof Error ? err.message : String(err),
    });
    await putBack();
    return NextResponse.json({ error: "Could not re-queue this job; it is still in the dead-letter list" }, { status: 500 });
  }
}
