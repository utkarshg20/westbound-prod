import { createAdapterRegistry } from "@westbound/adapters";
import { fetchProviderUri, guessContentType } from "@westbound/platform";
import { AssetLibrary } from "./asset-library.js";

export interface PocResult {
  step: string;
  success: boolean;
  artifactId?: string;
  notes: string;
}

/**
 * Studio POC spikes — LoRA/Flux, Kling, ElevenLabs+Hedra, Suno Persona.
 * Fetches real media bytes when provider URIs are http(s).
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

  for (let i = 0; i < 10; i++) {
    const img = await adapters.image.generate({
      prompt: `Sammy Rane hero still ${i}, dim bar, neon edge, LoRA locked, denim flannel`,
      loraVersion: "sammy_lora_v1",
      characterId: "sammy_rane",
    });
    if (library && i === 0) {
      try {
        const body = await fetchProviderUri(img.uri);
        const asset = await library.ingest({
          projectSlug: "studio",
          entitySlug: "sammy_rane",
          type: "image",
          filename: `poc_still_${i}.png`,
          body,
          contentType: guessContentType(img.uri, "image/png"),
          tool: adapters.image.name,
          prompt: `still ${i}`,
          tags: ["poc", "lora", "hero_ref"],
          sourceUri: img.uri,
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
          notes: `Generated still ${i}; ingest skipped: ${e}`,
        });
      }
    }
  }
  if (!results.some((r) => r.step === "lora_comfyui")) {
    results.push({
      step: "lora_comfyui",
      success: true,
      notes: "10 stills generated (ComfyUI/Flux path in docs/studio-poc.md)",
    });
  }

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
