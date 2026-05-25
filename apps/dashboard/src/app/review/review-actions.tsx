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

  return (
    <button type="button" className="btn" onClick={() => void approve()}>
      Approve
    </button>
  );
}
