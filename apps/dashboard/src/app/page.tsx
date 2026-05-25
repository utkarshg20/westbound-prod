import { createServerSupabase } from "@/lib/supabase";
import { DEMO_RUNS } from "@/lib/demo-data";
import { InfraStatus } from "@/components/infra-status";
import type { ProductionRun, ProductionStage } from "@westbound/platform";

const STAGES: ProductionStage[] = [
  "draft",
  "generating",
  "assets_ready",
  "dan_review",
  "scheduled",
  "published",
  "dsp_live",
];

async function loadRuns(): Promise<ProductionRun[]> {
  const db = createServerSupabase();
  if (!db) return DEMO_RUNS;
  const { data, error } = await db
    .from("production_runs")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data?.length) return DEMO_RUNS;
  return data as ProductionRun[];
}

export default async function PipelinePage() {
  const runs = await loadRuns();
  const totalCostCents = runs.reduce((s, r) => s + r.cost_cents, 0);
  const byStage = Object.fromEntries(
    STAGES.map((s) => [s, runs.filter((r) => r.stage === s)])
  ) as Record<ProductionStage, ProductionRun[]>;

  return (
    <>
      <h1>Production pipeline</h1>
      <InfraStatus />
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Total pipeline cost (tracked): ${(totalCostCents / 100).toFixed(2)}
      </p>
      {!createServerSupabase() && (
        <div className="alert">
          Demo mode — set Supabase env vars for live data.
        </div>
      )}
      <div className="kanban">
        {STAGES.map((stage) => (
          <div key={stage} className="column">
            <h2>{stage.replace(/_/g, " ")}</h2>
            {(byStage[stage] ?? []).map((run) => (
              <div key={run.id} className="card">
                <div>{run.title}</div>
                <div className="meta">
                  <span
                    className={`badge ${run.metadata?.tier === "hero" ? "hero" : "volume"}`}
                  >
                    {String(run.metadata?.tier ?? run.kind)}
                  </span>{" "}
                  ${(run.cost_cents / 100).toFixed(2)} cost
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
