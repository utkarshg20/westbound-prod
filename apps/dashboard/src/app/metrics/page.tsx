import { createSupabaseAdmin } from "@westbound/platform";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadMetrics() {
  try {
    const db = createSupabaseAdmin();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [signals, submissions, tracks, dlq, channels, outreach] = await Promise.all([
      db.from("signals").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      db.from("brief_submissions").select("id, match_score, status").gte("submitted_at", weekAgo),
      db.from("tracks").select("id, metadata").eq("source", "sync"),
      db.from("dead_letter_jobs").select("id", { count: "exact", head: true }),
      db.from("channels").select("*"),
      db
        .from("brief_submissions")
        .select("status")
        .gte("submitted_at", weekAgo),
    ]);

    const syncTracks = tracks.data ?? [];
    const scored = syncTracks.filter((t) => Number(t.metadata?.briefScore ?? 0) > 0);
    const avgScore =
      scored.length > 0
        ? scored.reduce((s, t) => s + Number(t.metadata?.briefScore ?? 0), 0) / scored.length
        : 0;

    const holdForDan = syncTracks.filter(
      (t) => t.metadata?.qaStatus === "hold_for_dan"
    ).length;
    const shortlistRate =
      scored.length > 0
        ? ((scored.length - holdForDan) / scored.length) * 100
        : 0;

    const subs = submissions.data ?? [];
    const won = subs.filter((s) => s.status === "won" || s.status === "placed").length;
    const winRate = subs.length > 0 ? (won / subs.length) * 100 : 0;

    const hardFails: string[] = [];
    if ((signals.count ?? 0) === 0) hardFails.push("zero_briefs_7d");
    if (avgScore > 0 && avgScore < 70) hardFails.push("avg_score_below_70");
    if ((dlq.count ?? 0) > 5) hardFails.push("dlq_elevated");
    if (subs.length === 0 && (signals.count ?? 0) > 0) {
      hardFails.push("zero_submissions_7d");
    }

    return {
      briefsDetected: signals.count ?? 0,
      submissionsWeek: subs.length,
      avgBriefScore: avgScore.toFixed(1),
      shortlistRate: shortlistRate.toFixed(1),
      winRate: winRate.toFixed(1),
      deadLetterCount: dlq.count ?? 0,
      channels: channels.data ?? [],
      hardFails,
      outreachPending: outreach.data?.length ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function MetricsPage() {
  const m = await loadMetrics();

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Engine metrics</h1>
      <p>
        <Link href="/">Pipeline</Link> · <Link href="/ops">Ops</Link> ·{" "}
        <Link href="/review">Review</Link>
      </p>

      {!m ? (
        <p>Connect Supabase to load live metrics (demo mode unavailable here).</p>
      ) : (
        <>
          <section style={{ marginTop: "1.5rem" }}>
            <h2>Engine 1 — Sync</h2>
            <ul>
              <li>Briefs detected (7d): {m.briefsDetected}</li>
              <li>Submissions (7d): {m.submissionsWeek}</li>
              <li>Avg brief score (scored tracks): {m.avgBriefScore}</li>
              <li>Shortlist rate: {m.shortlistRate}%</li>
              <li>Win rate (submissions): {m.winRate}%</li>
              <li>Dead letter jobs: {m.deadLetterCount}</li>
            </ul>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2>Engine 1.5 — Supervisor CRM</h2>
            <p>Outreach drafts pending Dan review: {m.outreachPending}</p>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2>Engine 2 — Channel cohort</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th align="left">Channel</th>
                  <th align="left">Kind</th>
                  <th align="left">Risk flag</th>
                  <th align="left">Cadence</th>
                </tr>
              </thead>
              <tbody>
                {m.channels.map((c: Record<string, unknown>) => (
                  <tr key={String(c.id)}>
                    <td>{String(c.name)}</td>
                    <td>{String(c.kind)}</td>
                    <td>{c.demonetization_risk_flag ? "elevated" : "normal"}</td>
                    <td>{String(c.publish_cadence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {m.hardFails.length > 0 && (
            <p style={{ color: "crimson", marginTop: "1.5rem" }}>
              Hard fail alerts: {m.hardFails.join(", ")}
            </p>
          )}
        </>
      )}
    </main>
  );
}
