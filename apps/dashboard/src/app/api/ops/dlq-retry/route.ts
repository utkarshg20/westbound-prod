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
  const jobId = await enqueueJob(parsed.data, payload, {
    productionRunId: row.production_run_id ?? undefined,
  });

  await db.from("dead_letter_jobs").delete().eq("id", body.dlqId);

  return NextResponse.json({ ok: true, jobId });
}
