# Studio POC — spike runbook

Run after Dan ref pack is in `docs/dan-ref-intake/`:

```bash
pnpm install
pnpm --filter @westbound/platform build
pnpm --filter @westbound/studio build
node packages/studio/dist/poc.js  # via worker job studio.poc
```

## 1. LoRA + ComfyUI (10 stills)

- Train `sammy_lora_v1` on RunPod with 15–30 hero refs.
- Export ComfyUI workflow to `infra/comfyui/sammy_lora_workflow.json`.
- Target: face embedding distance &lt; 0.25 vs hero portrait.

## 2. Kling Character ID

- Upload hero still as character reference.
- Generate 3s dialogue clip; verify wardrobe lock.

## 3. ElevenLabs + Hedra

- Train speaker from Suno/Logic master vocal.
- Lip-sync performance shot to final vocal WAV.

## 4. Suno Persona

- Lock `sammy_persona_v1` on keeper track.
- All catalog songs use same persona ID.
