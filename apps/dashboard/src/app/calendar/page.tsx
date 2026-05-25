import { createServerSupabase } from "@/lib/supabase";

interface CalEvent {
  date: string;
  label: string;
  type: "episode" | "song_drop" | "sync";
  public: boolean;
}

async function loadCalendar(): Promise<CalEvent[]> {
  const db = createServerSupabase();
  if (!db) {
    return [
      {
        date: "2026-05-24",
        label: "Episode 1 — The Noise",
        type: "episode",
        public: true,
      },
      {
        date: "2026-05-??",
        label: "Song drop (unpredictable)",
        type: "song_drop",
        public: false,
      },
    ];
  }

  const events: CalEvent[] = [];
  const { data: releases } = await db
    .from("releases")
    .select("scheduled_at, production_runs(title)")
    .not("scheduled_at", "is", null);

  for (const r of releases ?? []) {
    const title =
      (r.production_runs as { title?: string } | null)?.title ?? "Release";
    events.push({
      date: String(r.scheduled_at).slice(0, 10),
      label: title,
      type: "episode",
      public: true,
    });
  }

  const { data: drops } = await db.from("song_drop_windows").select("*");
  for (const d of drops ?? []) {
    events.push({
      date: String(d.window_start).slice(0, 10),
      label: "Song drop window",
      type: "song_drop",
      public: false,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export default async function CalendarPage() {
  const events = await loadCalendar();

  return (
    <>
      <h1>Content calendar</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Public episodes vs internal song-drop windows.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
            <th>Type</th>
            <th>Audience</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td>{e.date}</td>
              <td>{e.label}</td>
              <td>{e.type}</td>
              <td>{e.public ? "Public" : "Internal"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
