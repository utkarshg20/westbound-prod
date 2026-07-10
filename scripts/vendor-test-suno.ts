#!/usr/bin/env npx tsx
/** Vendor spike: 5 Suno generations for license/API verification */
import { SunoMusicGenerator } from "../packages/adapters/src/suno.js";

async function main() {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    console.error("Set SUNO_API_KEY");
    process.exit(1);
  }
  const suno = new SunoMusicGenerator(key, process.env.SUNO_API_BASE ?? "https://api.suno.ai");
  const tracks = await suno.generate({
    prompt: "Instrumental cinematic tension, 90 BPM, no vocals",
    instrumental: true,
    variations: 5,
  });
  console.log(JSON.stringify({ count: tracks.length, uris: tracks.map((t) => t.uri) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
