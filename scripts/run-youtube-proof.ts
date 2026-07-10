#!/usr/bin/env npx tsx
/** Schedule 14-day faceless channel proof. */
import { YouTubeFactory } from "../packages/studio/src/youtube-factory.js";

const channel = process.argv[2] ?? "lofi_compounder";

async function main() {
  const factory = new YouTubeFactory();
  const ids = await factory.schedule14DayProof(channel);
  console.log(JSON.stringify({ channel, runIds: ids, count: ids.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
