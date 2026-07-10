#!/usr/bin/env npx tsx
/**
 * Vendor spike: Seedance vs Kling vs Veo cost/quality harness (stub-safe).
 * Usage: npx tsx scripts/vendor-test-video.ts
 */
import { createAdapterRegistry } from "../packages/adapters/src/registry.js";
import { SeedanceVideoGenerator } from "../packages/adapters/src/seedance.js";
import { StubVideoGenerator } from "../packages/adapters/src/stubs.js";

async function main() {
  const adapters = createAdapterRegistry();
  const prompt = "Rain on neon highway at dusk, cinematic B-roll, 5 seconds";

  const seedance = process.env.SEEDANCE_API_KEY
    ? new SeedanceVideoGenerator(process.env.SEEDANCE_API_KEY)
    : new StubVideoGenerator("seedance");

  const kling = adapters.videoRouter.pickProvider({
    script: "",
    shotType: "dialogue",
    hasCharacter: true,
  });
  const veo = adapters.videoRouter.pickProvider({
    script: "",
    shotType: "establishing",
    hasCharacter: false,
  });

  const [s, k, v] = await Promise.all([
    seedance.generate({ prompt, shotType: "broll", durationSec: 5 }),
    kling.generate({ prompt, shotType: "dialogue", durationSec: 5 }),
    veo.generate({ prompt, shotType: "establishing", durationSec: 5 }),
  ]);

  console.log(
    JSON.stringify(
      {
        seedance: { uri: s.uri, costCents: s.costCents, name: seedance.name },
        kling: { uri: k.uri, costCents: k.costCents, name: kling.name },
        veo: { uri: v.uri, costCents: v.costCents, name: veo.name },
        recommendation:
          "Default B-roll: Seedance. Dialogue: Kling. Hero establishing: Veo.",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
