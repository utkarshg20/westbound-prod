import { createServerSupabase } from "@/lib/supabase";
import { ReviewActions } from "./review-actions";

interface QueueItem {
  id: string;
  title: string;
  kind: string;
  tier: string;
  queue: "sync" | "hero_publish" | "ref_intake";
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

  return items;
}

export default async function ReviewPage() {
  const items = await loadQueue();

  return (
    <>
      <h1>Review queues</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Dan approves sync tracks and hero publishes before scheduling.
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
        <h2 style={{ fontSize: "1rem" }}>Ref intake (Dan)</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          See <code>docs/dan-ref-intake/CHECKLIST.md</code> — upload hero refs
          before LoRA training.
        </p>
      </section>
    </>
  );
}
