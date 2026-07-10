"use client";

export function ReviewActions({
  itemId,
  queue,
}: {
  itemId: string;
  queue: string;
}) {
  async function approve() {
    await fetch("/api/review/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, queue }),
    });
    window.location.reload();
  }

  async function reject() {
    await fetch("/api/review/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, queue }),
    });
    window.location.reload();
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem" }}>
      <button type="button" className="btn" onClick={() => void approve()}>
        Approve
      </button>
      <button
        type="button"
        className="btn"
        style={{ opacity: 0.75 }}
        onClick={() => void reject()}
      >
        Reject
      </button>
    </span>
  );
}
