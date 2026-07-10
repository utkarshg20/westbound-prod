import { createServerSupabase } from "@/lib/supabase";
import { ReviewActions } from "./review-actions";
import { RefUploadForm } from "./ref-upload-form";

interface QueueItem {
  id: string;
  title: string;
  kind: string;
  tier: string;
  queue: "sync" | "hero_publish" | "supervisor_outreach" | "ref_intake";
}

const REF_CHECKLIST = [
  "01_hero_portrait.png",
  "02_profile_left.png",
  "03_profile_right.png",
  "04_wardrobe_a_full.png",
  "05_wardrobe_b_full.png",
  "06_wardrobe_c_full.png",
  "07_loc_indiana.png",
  "08_loc_bar.png",
  "09_loc_highway.png",
  "10_loc_la.png",
  "11_loc_rehearsal.png",
  "12_voice_spoken.wav",
  "13_voice_singing.wav",
];

async function loadRefIntakeStatus(): Promise<
  Array<{ filename: string; ingested: boolean }>
> {
  const db = createServerSupabase();
  if (!db) {
    return REF_CHECKLIST.map((filename) => ({ filename, ingested: false }));
  }

  const { data: projects } = await db
    .from("projects")
    .select("id")
    .eq("slug", "studio")
    .limit(1);
  const projectId = projects?.[0]?.id;
  if (!projectId) {
    return REF_CHECKLIST.map((filename) => ({ filename, ingested: false }));
  }

  const { data: assets } = await db
    .from("assets")
    .select("r2_uri, metadata")
    .eq("project_id", projectId);

  return REF_CHECKLIST.map((filename) => {
    const ingested = (assets ?? []).some(
      (a) =>
        a.r2_uri.includes(filename) ||
        String((a.metadata as Record<string, unknown>)?.filename ?? "") === filename
    );
    return { filename, ingested };
  });
}

async function loadQueue(): Promise<QueueItem[]> {
  const db = createServerSupabase();
  if (!db) {
    return [
      {
        id: "demo-sync-1",
        title: "Cinematic tense — Sync batch",
        kind: "track",
        tier: "volume",
        queue: "sync",
      },
      {
        id: "demo-hero-1",
        title: "Episode 1 — The Noise",
        kind: "episode",
        tier: "hero",
        queue: "hero_publish",
      },
    ];
  }

  const items: QueueItem[] = [];

  const { data: tracks } = await db
    .from("tracks")
    .select("id, title, metadata, source")
    .eq("source", "sync")
    .contains("metadata", { curationQueue: true });

  for (const t of tracks ?? []) {
    items.push({
      id: t.id,
      title: t.title,
      kind: "track",
      tier: "volume",
      queue: "sync",
    });
  }

  const { data: runs } = await db
    .from("production_runs")
    .select("id, title, metadata, kind")
    .eq("stage", "dan_review");

  for (const r of runs ?? []) {
    items.push({
      id: r.id,
      title: r.title,
      kind: r.kind,
      tier: String(r.metadata?.tier ?? "hero"),
      queue: "hero_publish",
    });
  }

  const { data: outreach } = await db
    .from("supervisor_outreach")
    .select("id, email_draft, supervisor_id")
    .eq("status", "pending_dan_review")
    .limit(20);

  for (const o of outreach ?? []) {
    items.push({
      id: o.id,
      title: `Outreach draft (${String(o.email_draft).slice(0, 40)}…)`,
      kind: "email",
      tier: "volume",
      queue: "supervisor_outreach",
    });
  }

  return items;
}

export default async function ReviewPage() {
  const [items, refStatus] = await Promise.all([
    loadQueue(),
    loadRefIntakeStatus(),
  ]);
  const refDone = refStatus.filter((r) => r.ingested).length;

  return (
    <>
      <h1>Review queues</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Dan approves sync tracks, hero publishes, and supervisor outreach before
        scheduling.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Queue</th>
            <th>Title</th>
            <th>Tier</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.queue}</td>
              <td>{item.title}</td>
              <td>
                <span className={`badge ${item.tier}`}>{item.tier}</span>
              </td>
              <td>
                <ReviewActions itemId={item.id} queue={item.queue} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem" }}>
          Ref intake (Dan) — {refDone}/{REF_CHECKLIST.length} complete
        </h2>
        <ul style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          {refStatus.map((r) => (
            <li key={r.filename} style={{ color: r.ingested ? "green" : undefined }}>
              {r.ingested ? "✓" : "○"} {r.filename}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
          Run <code>pnpm ingest:refs</code> after placing files in{" "}
          <code>docs/dan-ref-intake/</code>, or upload below.
        </p>
        <RefUploadForm />
        <p style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
          <a href="/login">Dan login</a>
        </p>
      </section>
    </>
  );
}
