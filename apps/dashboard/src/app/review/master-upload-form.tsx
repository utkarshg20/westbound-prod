"use client";

import { useState } from "react";

/** Upload Logic/Resolve master for a hero production run (S3 hand-off). */
export function MasterUploadForm({
  runId,
  hasMaster,
}: {
  runId: string;
  hasMaster: boolean;
}) {
  const [status, setStatus] = useState<string>("");
  const [needsLogin, setNeedsLogin] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("runId", runId);
    setNeedsLogin(false);
    setStatus("Uploading master…");
    const res = await fetch("/api/review/master-upload", {
      method: "POST",
      body: data,
    });
    if (res.status === 401) {
      setNeedsLogin(true);
      setStatus("Your session expired. Sign in again.");
      return;
    }
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      resolveMasterUri?: string;
      demo?: boolean;
    };
    if (!res.ok) {
      setStatus(json.error ?? "Upload failed");
      return;
    }
    setStatus(
      json.demo
        ? `Demo master URI set: ${json.resolveMasterUri ?? "ok"}`
        : `Master set: ${json.resolveMasterUri ?? "ok"}`
    );
    form.reset();
    window.setTimeout(() => window.location.reload(), 600);
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem" }}
    >
      <span style={{ fontSize: "0.75rem", color: hasMaster ? "green" : "var(--muted)" }}>
        {hasMaster ? "✓ master attached" : "○ needs Logic/Resolve master"}
      </span>
      <span style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
        <input type="file" name="file" accept="audio/*,video/*" required />
        <button type="submit" className="btn">
          Upload master
        </button>
      </span>
      {status && (
        <span role={needsLogin ? "alert" : undefined} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          {status} {needsLogin && <a href="/login" style={{ color: "inherit" }}>Sign in</a>}
        </span>
      )}
    </form>
  );
}
