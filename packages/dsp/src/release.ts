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
  scheduledAt: Date
): Promise<void> {
  const db = createSupabaseAdmin();
  await db.from("releases").insert({
    production_run_id: productionRunId,
    track_id: trackId,
    scheduled_at: scheduledAt.toISOString(),
    platforms: ["spotify", "apple", "youtube_music", "tidal", "amazon"],
    stage: "scheduled",
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
    await db.from("revenue_events").insert({
      project_id: studio.id,
      platform: row.platform,
      amount_cents: Math.round(row.amount * 100),
      period_month: `${row.month}-01`,
      metadata: { trackTitle: row.trackTitle },
    });
    count++;
  }
  return count;
}
