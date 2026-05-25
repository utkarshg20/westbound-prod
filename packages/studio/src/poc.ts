import { createAdapterRegistry } from "@westbound/adapters";
import { AssetLibrary } from "./asset-library.js";

export interface PocResult {
  step: string;
  success: boolean;
  artifactId?: string;
  notes: string;
}

/**
 * Studio POC spikes — LoRA/ComfyUI, Kling, ElevenLabs+Hedra, Suno Persona.
 * Uses stub adapters when API keys absent; records assets in library when DB configured.
 */
export async function runStudioPoc(): Promise<PocResult[]> {
  const results: PocResult[] = [];
  const adapters = createAdapterRegistry();
  let library: AssetLibrary | null = null;
  try {
    library = await AssetLibrary.create();
  } catch {
    library = null;
  }

  // 1. LoRA + ComfyUI (stub image batch = 10 stills)
  for (let i = 0; i < 10; i++) {
    await adapters.image.generate({
      prompt: `Sammy Rane hero still ${i}, dim bar, neon edge, LoRA locked, denim flannel`,
      loraVersion: "sammy_lora_v1",
      characterId: "sammy_rane",
    });
    if (library && i === 0) {
      try {
        const asset = await library.ingest({
          projectSlug: "studio",
          entitySlug: "sammy_rane",
          type: "image",
          filename: `poc_still_${i}.png`,
          body: Buffer.from(""),
          contentType: "image/png",
          tool: "comfyui",
          prompt: `still ${i}`,
          tags: ["poc", "lora", "hero_ref"],
        });
        results.push({
          step: "lora_comfyui",
          success: true,
          artifactId: asset.id,
          notes: "First still ingested; train LoRA from Dan refs before production",
        });
      } catch (e) {
        results.push({
          step: "lora_comfyui",
          success: true,
          notes: `Generated stub still ${i}; DB ingest skipped: ${e}`,
        });
      }
    }
  }
  if (!results.some((r) => r.step === "lora_comfyui")) {
    results.push({
      step: "lora_comfyui",
      success: true,
      notes: "10 stub stills generated (ComfyUI path documented in docs/studio-poc.md)",
    });
  }

  // 2. Kling Character ID clip
  const kling = adapters.videoRouter.pickProvider({
    script: "",
    shotType: "dialogue",
    hasCharacter: true,
  });
  const clip = await kling.generate({
    prompt: "Sammy face locked, 3 second dialogue shot",
    characterId: "sammy_rane",
    shotType: "dialogue",
    durationSec: 3,
  });
  results.push({
    step: "kling_character_id",
    success: true,
    notes: `Clip URI: ${clip.uri}`,
  });

  // 3. ElevenLabs + Hedra
  const voice = await adapters.voice.generate({
    text: "I didn't leave the noise.",
    characterId: "sammy_rane",
  });
  const lipsync = await adapters.lipSync.sync({
    videoUri: clip.uri,
    audioUri: voice.uri,
    characterId: "sammy_rane",
  });
  results.push({
    step: "elevenlabs_hedra",
    success: true,
    notes: `Voice + lip-sync: ${lipsync.uri}`,
  });

  // 4. Suno Persona track
  const tracks = await adapters.music.generate({
    prompt: "Post-grunge anthem, Sammy persona, raw vocal",
    personaId: "sammy_persona_v1",
    variations: 1,
  });
  results.push({
    step: "suno_persona",
    success: tracks.length > 0,
    notes: `Track: ${tracks[0]?.uri ?? "none"}`,
  });

  return results;
}
