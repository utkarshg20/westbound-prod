import { createServerSupabase } from "@/lib/supabase";
import { DEMO_REVENUE, computeLlcSplit } from "@/lib/demo-data";

export default async function RevenuePage() {
  const db = createServerSupabase();
  let events = DEMO_REVENUE;
  if (db) {
    const { data } = await db.from("revenue_events").select("*");
    if (data?.length) events = data as typeof DEMO_REVENUE;
  }

  const totalCents = events.reduce((s, e) => s + e.amount_cents, 0);
  const split = computeLlcSplit(totalCents, 1);

  return (
    <>
      <h1>Revenue</h1>
      <p style={{ color: "var(--muted)" }}>
        Total: ${(totalCents / 100).toLocaleString()} — {split.label}
      </p>
      <div className="split-bar">
        <div
          className="split-dan"
          style={{ width: `${(split.dan / totalCents) * 100}%` }}
        />
        <div
          className="split-ug"
          style={{ width: `${(split.ug / totalCents) * 100}%` }}
        />
      </div>
      <p style={{ fontSize: "0.85rem" }}>
        Dan: ${(split.dan / 100).toLocaleString()} · UG:{" "}
        ${(split.ug / 100).toLocaleString()}
      </p>
      <table className="table" style={{ marginTop: "2rem" }}>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Month</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.platform}</td>
              <td>{e.period_month}</td>
              <td>${(e.amount_cents / 100).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
