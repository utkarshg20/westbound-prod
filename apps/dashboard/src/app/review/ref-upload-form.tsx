"use client";

import { useState } from "react";

export function RefUploadForm() {
  const [status, setStatus] = useState<string>("");
  const [needsLogin, setNeedsLogin] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setNeedsLogin(false);
    setStatus("Uploading…");
    const res = await fetch("/api/refs/upload", { method: "POST", body: data });
    if (res.status === 401) {
      setNeedsLogin(true);
      setStatus("Your session expired. Sign in again.");
      return;
    }
    const json = (await res.json()) as { ok?: boolean; error?: string; filename?: string };
    if (!res.ok) {
      setStatus(json.error ?? "Upload failed");
      return;
    }
    setStatus(`Queued ingest: ${json.filename ?? "ok"}`);
    form.reset();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: "0.75rem" }}>
      <input type="file" name="file" required />
      <button type="submit" className="btn" style={{ marginLeft: "0.5rem" }}>
        Upload ref
      </button>
      {status && (
        <p role={needsLogin ? "alert" : undefined} style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
          {status} {needsLogin && <a href="/login" style={{ color: "inherit" }}>Sign in</a>}
        </p>
      )}
    </form>
  );
}
