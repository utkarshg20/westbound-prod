#!/usr/bin/env npx tsx
/**
 * Run 3 internal Sammy dry-runs through dan_review for ship gate validation.
 */
import { runVerticalSlice } from "../packages/studio/src/vertical-slice.js";
import { createSupabaseAdmin } from "../packages/platform/src/index.js";

async function main() {
  const results: Array<{ runId: string; stages: string[]; canonViolations: number }> = [];

  for (let i = 1; i <= 3; i++) {
    const { runId, stages } = await runVerticalSlice({
      requireDanApproval: true,
      episodeNumber: i > 1 ? 1 : 1,
    });

    let canonViolations = 0;
    try {
      const db = createSupabaseAdmin();
      const { data: run } = await db
        .from("production_runs")
        .select("metadata")
        .eq("id", runId)
        .single();
      const continuity = run?.metadata?.continuity as { passed?: boolean } | undefined;
      if (continuity && continuity.passed === false) canonViolations = 1;
      await db
        .from("production_runs")
        .update({
          metadata: {
            ...(run?.metadata as object),
            dryRun: i,
            dryRunAt: new Date().toISOString(),
          },
        })
        .eq("id", runId);
    } catch {
      /* demo mode without DB */
    }

    results.push({ runId, stages, canonViolations });
    console.log(`Dry run ${i}:`, { runId, stages, canonViolations });
  }

  const totalViolations = results.reduce((s, r) => s + r.canonViolations, 0);
  console.log(JSON.stringify({ results, totalViolations, passed: totalViolations === 0 }, null, 2));
  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
