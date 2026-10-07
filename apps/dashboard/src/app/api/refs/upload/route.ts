import { NextResponse } from "next/server";
import { AssetStorage, buildAssetKey } from "@westbound/platform";
import { createServerSupabase } from "@/lib/supabase";
import { ingestTagsForFilename } from "@/lib/ingest-tags";

const PROJECT_SLUG = "studio";
const ENTITY_SLUG = "sammy_rane";

/**
 * Upload a Dan ref asset into the studio asset library.
 * Uploads directly to R2 — no base64-over-JSON worker hop.
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

  const filename = String(form.get("filename") ?? file.name ?? "ref.bin").replace(
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

  // Resolve project_id for this entity's namespace.
  const { data: project, error: projErr } = await db
    .from("projects")
    .select("id")
    .eq("slug", PROJECT_SLUG)
    .maybeSingle();
  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json(
      { error: `project not found: ${PROJECT_SLUG}` },
      { status: 500 }
    );
  }

  // Determine the next version number (same logic as AssetLibrary.ingest).
  const { data: existing, error: listErr } = await db
    .from("assets")
    .select("version, r2_uri")
    .eq("project_id", project.id);
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const sameEntity = (existing ?? []).filter((a: { r2_uri: string }) =>
    a.r2_uri.includes(`/${ENTITY_SLUG}/`)
  );
  const version =
    sameEntity.length > 0
      ? Math.max(...(sameEntity as { version: number }[]).map((a) => a.version)) + 1
      : 1;

  const key = buildAssetKey({
    project: PROJECT_SLUG,
    entity: ENTITY_SLUG,
    version,
    filename,
  });

  // Upload directly to R2; fall back to a local:// stub when R2 is not configured.
  let r2Uri = `local://${key}`;
  try {
    const storage = await AssetStorage.fromEnv();
    r2Uri = await storage.upload(key, buf, contentType);
  } catch {
    // R2 not configured — local dev only; stub path still creates the DB row.
  }

  const { error: insertErr } = await db.from("assets").insert({
    project_id: project.id,
    character_id: null,
    parent_id: null,
    type,
    r2_uri: r2Uri,
    version,
    tool: null,
    prompt_hash: null,
    qa_status: "pending",
    tags: tags.length ? tags : ["dashboard_upload", "ref_pack"],
    metadata: { filename, entitySlug: ENTITY_SLUG, contentType },
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filename, type, tags });
}
