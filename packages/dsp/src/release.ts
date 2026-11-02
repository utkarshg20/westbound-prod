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
): Promise<string> {
  const db = createSupabaseAdmin();
  const { data, error } = await db.from("releases").insert({
    production_run_id: productionRunId,
    track_id: trackId,
    scheduled_at: scheduledAt.toISOString(),
    platforms: ["spotify", "apple", "youtube_music", "tidal", "amazon"],
    stage: "scheduled",
    ddex_ai_disclosure: ddexAiDisclosure,
    metadata: { disclosure: ddexAiDisclosure },
  }).select("id").single();
  // The insert result used to be ignored: a failed row (for instance a production_run_id with no run behind it) left
  // nothing on record while the caller went on to submit the track to a distributor.
  if (error || !data) throw new Error(`could not record the release for track ${trackId}: ${error?.message ?? "no row returned"}`);
  return String(data.id);
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
  const db = createSupabaseAdmin();
  const { data: track, error: trackError } = await db.from("tracks").select("*").eq("id", trackId).maybeSingle();
  if (trackError) throw new Error(`release candidate: could not read track ${trackId}: ${trackError.message}`);
  if (!track) throw new Error(`release candidate: track ${trackId} not found`);
  // Generated tracks are routed here as soon as they exist. Nothing leaves for a distributor before a person approved it.
  if (track.metadata?.qaStatus !== "approved") {
    throw new Error(`release candidate: track ${trackId} is not approved (qaStatus ${String(track.metadata?.qaStatus ?? "unset")})`);
  }

  // A retried job must not record, or submit, the same track twice.
  const { data: existing, error: existingError } = await db
    .from("releases").select("id, metadata").eq("track_id", trackId).limit(1).maybeSingle();
  if (existingError) throw new Error(`release candidate: could not check for an earlier release (${existingError.message})`);
  const releaseId = existing ? String(existing.id) : await createDspRelease(runId, trackId, new Date());
  if (existing?.metadata?.distrokid_submitted === true) return;

  const apiKey = process.env.DISTROKID_API_KEY;
  if (!apiKey) return;

  const { DistroKidPublisher } = await import("@westbound/adapters");
  const publisher = new DistroKidPublisher(apiKey);
  await publisher.publish({
    title: track.title,
    description: String(track.metadata?.description ?? ""),
    mediaUri: String(track.metadata?.audioUri ?? ""),
    ddexAiDisclosure: "AI-assisted, human-curated",
  });
  const { error: markError } = await db
    .from("releases")
    .update({ metadata: { ...(existing?.metadata ?? {}), disclosure: "AI-assisted, human-curated", distrokid_submitted: true } })
    .eq("id", releaseId);
  if (markError) throw new Error(`release candidate: submitted to DistroKid but could not record it (${markError.message}); do not retry blindly`);
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

/** Dollars to whole cents without binary-float drift: 1.005 * 100 is 100.49999999999999, not 100.5. */
export function dollarsToCents(amount: number): number {
  return Math.round(Number(`${amount.toFixed(6)}e2`));
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
  // Identical lines in one file are separate statement lines (two territories can report the same figure). A line is a
  // duplicate only when the table already holds more matching rows than this file has used so far.
  const seen = new Map<string, number>();
  for (const row of rows) {
    const amountCents = dollarsToCents(row.amount);
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
    const matches = (existing ?? []).filter(
      (e: { metadata?: { trackTitle?: string } | null }) => (e.metadata?.trackTitle ?? null) === title
    ).length;
    const key = JSON.stringify([row.platform, periodMonth, amountCents, title]);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    if (matches > occurrence) continue;
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
