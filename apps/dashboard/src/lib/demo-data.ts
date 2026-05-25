import type { ProductionRun, RevenueEvent } from "@westbound/platform";

export const DEMO_RUNS: ProductionRun[] = [
  {
    id: "demo-1",
    project_id: "demo",
    kind: "episode",
    title: "Episode 1 — The Noise",
    stage: "dan_review",
    status: "active",
    cost_cents: 4200,
    metadata: { tier: "hero" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    project_id: "demo",
    kind: "sync_batch",
    title: "Sync batch 2026-05-17",
    stage: "assets_ready",
    status: "active",
    cost_cents: 800,
    metadata: { tier: "volume" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_REVENUE: RevenueEvent[] = [
  {
    id: "r1",
    project_id: "demo",
    platform: "songtradr",
    amount_cents: 150000,
    currency: "USD",
    track_id: null,
    period_month: "2026-05-01",
    metadata: {},
  },
  {
    id: "r2",
    project_id: "demo",
    platform: "youtube",
    amount_cents: 45000,
    currency: "USD",
    track_id: null,
    period_month: "2026-05-01",
    metadata: {},
  },
];

export function computeLlcSplit(
  totalCents: number,
  year: number
): { dan: number; ug: number; label: string } {
  if (year === 1) {
    return {
      dan: Math.round(totalCents * 0.6),
      ug: Math.round(totalCents * 0.4),
      label: "Year 1 (60/40)",
    };
  }
  return {
    dan: Math.round(totalCents * 0.5),
    ug: Math.round(totalCents * 0.5),
    label: "50/50",
  };
}
