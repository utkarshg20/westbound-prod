import { createSupabaseAdmin, enqueueJob, JobTypeSchema } from "@westbound/platform";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { dlqId: string };
  const db = createSupabaseAdmin();
  const { data: row, error } = await db
    .from("dead_letter_jobs")
    .select("*")
    .eq("id", body.dlqId)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "DLQ row not found" }, { status: 404 });
  }

  const jobType = String(row.job_type);
  const parsed = JobTypeSchema.safeParse(jobType);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }

  const payload = (row.payload as Record<string, unknown>) ?? {};
  let jobId: string;
  try {
    jobId = await enqueueJob(parsed.data, payload, {
      productionRunId: row.production_run_id ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to re-enqueue job: ${msg}` }, { status: 500 });
  }

  // Delete after successful enqueue. If this fails, the job is already running;
  // the stale DLQ row can be cleaned up manually without re-running the job.
  await db.from("dead_letter_jobs").delete().eq("id", body.dlqId);

  return NextResponse.json({ ok: true, jobId });
}
