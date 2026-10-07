"use client";

import { useState } from "react";

export function RoyaltyUploadForm() {
  const [csv, setCsv] = useState(
    "platform,amount,month,trackTitle\nsongtradr,1500,2026-05,\nyoutube,450,2026-05,"
  );
  const [result, setResult] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function submit() {
    setNeedsLogin(false);
    const res = await fetch("/api/ops/royalty-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    if (res.status === 401) {
      setNeedsLogin(true);
      setResult("Your session expired. Sign in again.");
      return;
    }
    const data = (await res.json()) as { imported?: number; error?: string };
    setResult(
      data.error ?? `Imported ${data.imported ?? 0} revenue events`
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "0.75rem",
          fontFamily: "monospace",
          fontSize: "0.85rem",
        }}
      />
      <button
        type="button"
        className="btn"
        style={{ marginTop: "0.5rem" }}
        onClick={() => void submit()}
      >
        Import
      </button>
      {result && (
        <p role={needsLogin ? "alert" : undefined} style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
          {result} {needsLogin && <a href="/login" style={{ color: "inherit" }}>Sign in</a>}
        </p>
      )}
    </div>
  );
}
