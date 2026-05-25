import Link from "next/link";
import { RoyaltyUploadForm } from "./royalty-upload-form";

export default function OpsPage() {
  return (
    <>
      <h1>Ops — Week 6</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Royalty import, cost visibility, automation checklist.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem" }}>Royalty CSV import</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Format: platform,amount,month,trackTitle (USD amounts)
        </p>
        <RoyaltyUploadForm />
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem" }}>Weekly revenue review</h2>
        <ul style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          <li>
            <Link href="/revenue">Revenue dashboard</Link> — LLC split Y1 60/40
          </li>
          <li>
            <Link href="/">Pipeline</Link> — stage retro + cost per run
          </li>
          <li>
            <Link href="/errors">Errors</Link> — top job failures
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem" }}>n8n automation</h2>
        <ul style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          <li>sync-signal-ingest.json — daily</li>
          <li>sync-generate-batch.json — after ingest</li>
          <li>sync-brief-match.json — daily</li>
          <li>youtube-daily.json — daily (set proof14 in payload for 14-day batch)</li>
        </ul>
      </section>
    </>
  );
}
