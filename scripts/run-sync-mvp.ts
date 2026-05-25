#!/usr/bin/env npx tsx
/**
 * Sync MVP batch: ingest signals → generate → queue for Dan curation.
 * Usage: SIGNAL_CSV_PATH=infra/supabase/sample-signals.csv npx tsx scripts/run-sync-mvp.ts
 */
import { SyncEngine } from "../packages/sync-engine/src/pipeline.js";

async function main() {
  const engine = new SyncEngine();
  const ingested = await engine.runSignalIngest();
  console.log("Signals ingested:", ingested);

  const limit = Number(process.env.SYNC_BATCH_LIMIT ?? 13);
  const trackIds = await engine.runGenerateBatch(limit);
  await engine.submitToCurationQueue(trackIds);
  console.log("Tracks queued for curation:", trackIds.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
