import { rankBriefMatches } from "@westbound/agents";
import { createRepository, createSupabaseAdmin } from "@westbound/platform";

const SUBMIT_WITHIN_HOURS = 24;

export class BriefMatcher {
  private readonly repo = createRepository();

  async runMatchAndSubmit(): Promise<number> {
    const signals = await this.repo.listSignals(true);
    const tracks = await this.repo.listTracks({ source: "sync" });
    const pending = tracks.filter(
      (t) => t.metadata.qaStatus === "approved" || t.metadata.uploaded
    );

    const matches = rankBriefMatches(
      pending.map((t) => ({
        id: t.id,
        mood_tags: t.mood_tags,
        metadata: t.metadata,
      })),
      signals,
      0.55
    );

    const db = createSupabaseAdmin();
    let submitted = 0;
    const cutoff = Date.now() - SUBMIT_WITHIN_HOURS * 60 * 60 * 1000;

    for (const match of matches) {
      const signal = signals.find((s) => s.id === match.signalId);
      if (!signal) continue;
      const created = new Date(signal.created_at).getTime();
      if (created < cutoff) continue;

      const { error } = await db.from("brief_submissions").insert({
        track_id: match.trackId,
        signal_id: match.signalId,
        platform: match.platform,
        match_score: match.score,
        submitted_at: new Date().toISOString(),
        status: "submitted",
      });
      if (!error) {
        submitted++;
        await this.repo.markSignalProcessed(match.signalId);
      }
    }

    return submitted;
  }

  async scheduleDailyMatch(): Promise<void> {
    await this.runMatchAndSubmit();
  }
}
