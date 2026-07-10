#!/usr/bin/env npx tsx
/**
 * Pre-generate visual loops for all music channels into R2 (or local stub URIs).
 * Usage: npx tsx scripts/generate-visual-loops.ts
 */
import { CHANNEL_THEMES, ensureVisualLoop } from "../packages/studio/src/youtube-factory.js";

async function main() {
  const results: Array<{ slug: string; uri: string }> = [];
  for (const theme of CHANNEL_THEMES) {
    const uri = await ensureVisualLoop(theme.slug);
    results.push({ slug: theme.slug, uri });
    console.log(`${theme.slug}: ${uri}`);
  }
  console.log(JSON.stringify({ count: results.length, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
