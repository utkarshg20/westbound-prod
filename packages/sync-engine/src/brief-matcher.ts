import { rankBriefMatches } from "@westbound/agents";
import { createRepository, createSupabaseAdmin } from "@westbound/platform";

const SUBMIT_WITHIN_HOURS = 24;
const MIN_BRIEF_SCORE = 85;
const MIN_MATCH_SCORE = 0.55;

export class BriefMatcher {
  private readonly repo = createRepository();

  async runMatchAndSubmit(): Promise<number> {
    const signals = await this.repo.listSignals(true);
    const tracks = await this.repo.listTracks({ source: "sync" });
    const eligible = tracks.filter((t) => {
      const meta = t.metadata;
      const score = Number(meta.briefScore ?? 0);
      const qa = String(meta.qaStatus ?? "");
      return (
        score >= MIN_BRIEF_SCORE &&
        (qa === "approved" || qa === "pending_curation") &&
        !meta.submitted
      );
    });

    const matches = rankBriefMatches(
      eligible.map((t) => ({
        id: t.id,
        mood_tags: t.mood_tags,
        metadata: t.metadata,
      })),
      signals,
      MIN_MATCH_SCORE
    );

    const db = createSupabaseAdmin();
    let submitted = 0;
    const cutoff = Date.now() - SUBMIT_WITHIN_HOURS * 60 * 60 * 1000;

    for (const match of matches) {
      const signal = signals.find((s) => s.id === match.signalId);
      if (!signal) continue;
      const created = new Date(signal.created_at).getTime();
      if (created < cutoff) continue;

      const track = eligible.find((t) => t.id === match.trackId);
      if (!track || Number(track.metadata.briefScore ?? 0) < MIN_BRIEF_SCORE) {
        continue;
      }

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
        await db
          .from("tracks")
          .update({
            metadata: { ...track.metadata, submitted: true, submittedAt: new Date().toISOString() },
          })
          .eq("id", match.trackId);
        await this.repo.markSignalProcessed(match.signalId);
      }
    }

    return submitted;
  }

  async scheduleDailyMatch(): Promise<void> {
    await this.runMatchAndSubmit();
  }
}
