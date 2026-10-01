"use client";

import { useState } from "react";

export function ReviewActions({
  itemId,
  queue,
}: {
  itemId: string;
  queue: string;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function act(action: "approve" | "reject") {
    setPending(true);
    setError("");
    setNeedsLogin(false);
    try {
      const response = await fetch(`/api/review/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, queue }),
      });
      if (!response.ok) {
        setNeedsLogin(response.status === 401);
        setError(response.status === 401 ? "Your session expired. Sign in again." : "Review action failed. Please try again.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem" }}>
      <button type="button" className="btn" disabled={pending} onClick={() => void act("approve")}>
        Approve
      </button>
      <button
        type="button"
        className="btn"
        style={{ opacity: 0.75 }}
        disabled={pending}
        onClick={() => void act("reject")}
      >
        Reject
      </button>
      {error && <span role="alert">{error} {needsLogin && <a href="/login" style={{ color: "inherit" }}>Sign in</a>}</span>}
    </span>
  );
}
