import { NextResponse } from "next/server";
import {
  AssetStorage,
  buildAssetKey,
  type ProductionStage,
} from "@westbound/platform";
import { createServerSupabase } from "@/lib/supabase";
import { reviewRepository } from "@/lib/review-decision";

/**
 * S3 — Dan master hand-off.
 * Uploads a Logic/Resolve master to R2 and writes metadata.resolveMasterUri
 * on the production run. Pipeline publish() reads that field (and only that /
 * episodeVideoUri) as the media source.
 *
 * Body: multipart `file` + `runId`.
 *
 * Refused (409) once the run is published, live or failed: a master can no
 * longer reach (or change) what was released.
 */
const MASTER_CLOSED_STAGES: readonly ProductionStage[] = ["published", "dsp_live", "failed"];

export async function POST(req: Request) {
  const db = createServerSupabase();
  const form = await req.formData();
  const runId = String(form.get("runId") ?? "").trim();
  const file = form.get("file");

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filename = String(form.get("filename") ?? file.name ?? "master.mov").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  const contentType = file.type || "application/octet-stream";
  const buf = Buffer.from(await file.arrayBuffer());

  // Demo / no-credentials path — still prove the metadata write contract.
  if (!db) {
    return NextResponse.json({
      ok: true,
      demo: true,
      runId,
      resolveMasterUri: `demo://master/${runId}/${filename}`,
    });
  }

  const { data: run, error: loadErr } = await db
    .from("production_runs")
    .select("id, stage, project_id")
    .eq("id", runId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: `run not found: ${runId}` }, { status: 404 });
  }
  if (MASTER_CLOSED_STAGES.includes(run.stage as ProductionStage)) {
    return NextResponse.json(
      { error: `run is in stage ${run.stage}; masters can no longer be attached`, stage: run.stage },
      { status: 409 }
    );
  }

  let resolveMasterUri: string;
  try {
    const storage = await AssetStorage.fromEnv();
    const key = buildAssetKey({
      project: "studio",
      entity: "sammy_rane",
      version: 1,
      filename: `masters/${runId}/${filename}`,
    });
    resolveMasterUri = await storage.upload(key, buf, contentType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `R2 upload failed — set R2_* env vars (${msg})`,
      },
      { status: 503 }
    );
  }

  try {
    // Same service-role client as above, so no env-mismatch fallback is needed;
    // a failed write is reported instead of retried as a stale overwrite.
    const repo = reviewRepository(db);
    await repo.mergeProductionRunMetadata(runId, {
      resolveMasterUri,
      resolveMasterFilename: filename,
      resolveMasterUploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[master-upload] metadata write failed", err);
    return NextResponse.json(
      { error: "Master uploaded but the run metadata could not be updated", resolveMasterUri },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, runId, resolveMasterUri, filename });
}
