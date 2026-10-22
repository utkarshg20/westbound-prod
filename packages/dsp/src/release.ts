import { createRepository, createSupabaseAdmin } from "@westbound/platform";

export interface DspReleaseChecklist {
  distrokid: boolean;
  songtrust: boolean;
  identifyy: boolean;
  spotifyEditorialPitch: boolean;
}

export async function createDspRelease(
  productionRunId: string,
  trackId: string,
  scheduledAt: Date,
  ddexAiDisclosure = "AI-assisted, human-curated"
): Promise<void> {
  const db = createSupabaseAdmin();
  await db.from("releases").insert({
    production_run_id: productionRunId,
    track_id: trackId,
    scheduled_at: scheduledAt.toISOString(),
    platforms: ["spotify", "apple", "youtube_music", "tidal", "amazon"],
    stage: "scheduled",
    ddex_ai_disclosure: ddexAiDisclosure,
    metadata: { disclosure: ddexAiDisclosure },
  });
}

export function getReleaseChecklist(): DspReleaseChecklist {
  return {
    distrokid: false,
    songtrust: false,
    identifyy: false,
    spotifyEditorialPitch: false,
  };
}

export async function publishReleaseCandidate(
  runId: string,
  trackId: string
): Promise<void> {
  await createDspRelease(runId, trackId, new Date());

  const apiKey = process.env.DISTROKID_API_KEY;
  if (!apiKey) return;

  const { DistroKidPublisher } = await import("@westbound/adapters");
  const db = createSupabaseAdmin();
  const { data: track } = await db.from("tracks").select("*").eq("id", trackId).single();
  if (!track) return;

  const publisher = new DistroKidPublisher(apiKey);
  await publisher.publish({
    title: track.title,
    description: String(track.metadata?.description ?? ""),
    mediaUri: String(track.metadata?.audioUri ?? ""),
    ddexAiDisclosure: "AI-assisted, human-curated",
  });
}

export async function markChecklistItem(
  releaseId: string,
  item: keyof DspReleaseChecklist
): Promise<void> {
  const db = createSupabaseAdmin();
  const { data } = await db
    .from("releases")
    .select("metadata")
    .eq("id", releaseId)
    .single();
  const meta = (data?.metadata as Record<string, unknown>) ?? {};
  const checklist = (meta.checklist as DspReleaseChecklist) ?? getReleaseChecklist();
  checklist[item] = true;
  await db
    .from("releases")
    .update({ metadata: { ...meta, checklist } })
    .eq("id", releaseId);
}

export async function aggregateRoyaltiesCsv(
  rows: Array<{ platform: string; amount: number; month: string; trackTitle?: string }>
): Promise<number> {
  const repo = createRepository();
  const projects = await repo.listProjects();
  const studio = projects.find((p) => p.slug === "studio");
  if (!studio) return 0;

  const db = createSupabaseAdmin();
  let count = 0;
  for (const row of rows) {
    const amountCents = Math.round(row.amount * 100);
    const periodMonth = `${row.month}-01`;
    // The same statement line imported twice (a double submit, or the file re-uploaded) must not double the revenue.
    const { data: existing, error: lookupError } = await db
      .from("revenue_events")
      .select("id, metadata")
      .eq("project_id", studio.id)
      .eq("platform", row.platform)
      .eq("period_month", periodMonth)
      .eq("amount_cents", amountCents);
    if (lookupError) throw new Error(`royalty import: could not check for duplicates (${lookupError.message})`);
    const title = row.trackTitle ?? null;
    if ((existing ?? []).some((e: { metadata?: { trackTitle?: string } | null }) => (e.metadata?.trackTitle ?? null) === title)) continue;
    const { error } = await db.from("revenue_events").insert({
      project_id: studio.id,
      platform: row.platform,
      amount_cents: amountCents,
      period_month: periodMonth,
      metadata: { trackTitle: row.trackTitle },
    });
    if (error) throw new Error(`royalty import stopped at ${row.platform} ${row.month}: ${error.message} (${count} rows imported before it)`);
    count++;
  }
  return count;
}
