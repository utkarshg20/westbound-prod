import { createServerSupabase } from "@/lib/supabase";

export async function InfraStatus() {
  const db = createServerSupabase();
  const supabase = db ? "connected" : "demo";
  const stubs = process.env.USE_STUB_ADAPTERS !== "false";

  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        fontSize: "0.8rem",
        color: "var(--muted)",
        marginBottom: "1rem",
        flexWrap: "wrap",
      }}
    >
      <span>
        Supabase: <strong style={{ color: "var(--text)" }}>{supabase}</strong>
      </span>
      <span>
        Adapters:{" "}
        <strong style={{ color: "var(--text)" }}>
          {stubs ? "stub" : "live"}
        </strong>
      </span>
      <span>
        Worker:{" "}
        <strong style={{ color: "var(--text)" }}>
          {process.env.WORKER_API_URL ?? "localhost:3001"}
        </strong>
      </span>
    </div>
  );
}
