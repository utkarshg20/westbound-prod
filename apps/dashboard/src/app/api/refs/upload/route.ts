import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { ingestTagsForFilename } from "@/lib/ingest-tags";

/**
 * Upload a Dan ref asset into the studio asset library via worker job.
 * Body: multipart form with `file` + optional `filename`.
 */
export async function POST(req: Request) {
  const db = createServerSupabase();
  if (!db) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filename =
    String(form.get("filename") ?? file.name ?? "ref.bin").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
  const contentType = file.type || "application/octet-stream";
  const type = contentType.startsWith("audio")
    ? "audio"
    : contentType.startsWith("video")
      ? "video"
      : "image";
  const tags = ingestTagsForFilename(filename);

  const buf = Buffer.from(await file.arrayBuffer());
  const workerUrl = process.env.WORKER_API_URL ?? "http://localhost:3001";
  const secret = process.env.N8N_WEBHOOK_SECRET;

  let workerResp: Response;
  try {
    workerResp = await fetch(`${workerUrl}/api/jobs/enqueue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-n8n-secret": secret } : {}),
      },
      body: JSON.stringify({
        type: "studio.ingest_asset",
        payload: {
          projectSlug: "studio",
          entitySlug: "sammy_rane",
          filename,
          bodyBase64: buf.toString("base64"),
          contentType,
          type,
          tags,
          metadata: { filename },
        },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "worker unreachable — start pnpm worker" },
      { status: 502 }
    );
  }

  if (!workerResp.ok) {
    if (workerResp.status === 413) {
      return NextResponse.json(
        { error: `file too large: worker rejected the base64 body (limit ~75 KB; file is ${buf.length} bytes)` },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { error: `worker rejected the upload (HTTP ${workerResp.status})` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, filename, type, tags });
}
