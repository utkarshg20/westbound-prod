#!/usr/bin/env npx tsx
/** Vendor spike: 20-image Replicate Flux batch (~$0.80) */
import { ReplicateFluxClient } from "../packages/adapters/src/replicate-flux.js";

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("Set REPLICATE_API_TOKEN");
    process.exit(1);
  }
  const client = new ReplicateFluxClient(token);
  const results = [];
  for (let i = 0; i < 20; i++) {
    const r = await client.generateImage(`Westbound test still ${i}, cinematic bar, neon`);
    results.push(r);
    console.log(`Image ${i + 1}/20:`, r.uri.slice(0, 60));
  }
  console.log(JSON.stringify({ count: results.length, totalCents: results.length * 4 }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
