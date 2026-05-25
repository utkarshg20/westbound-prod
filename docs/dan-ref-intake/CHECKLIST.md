# Sammy Rane — Hero Reference Intake (Dan)

Gate for LoRA training and Kling Character ID. Place files in this folder using the naming below.

## Required deliverables

| # | Asset | Filename pattern | Notes |
|---|--------|------------------|-------|
| 1 | Hero portrait (neutral, front 3/4) | `01_hero_portrait.png` | Primary face lock |
| 2 | Hero portrait (profile left) | `02_profile_left.png` | |
| 3 | Hero portrait (profile right) | `03_profile_right.png` | |
| 4 | Wardrobe A — denim/flannel | `04_wardrobe_a_full.png` | Indiana bar vibe |
| 5 | Wardrobe B — leather jacket | `05_wardrobe_b_full.png` | LA night |
| 6 | Wardrobe C — stage / performance | `06_wardrobe_c_full.png` | |
| 7 | Location — Indiana farmland dusk | `07_loc_indiana.png` | |
| 8 | Location — dim bar interior | `08_loc_bar.png` | |
| 9 | Location — I-70 / highway | `09_loc_highway.png` | |
| 10 | Location — Echo Park / LA night | `10_loc_la.png` | |
| 11 | Location — rehearsal space | `11_loc_rehearsal.png` | |
| 12 | Voice sample — spoken (30s) | `12_voice_spoken.wav` | For ElevenLabs |
| 13 | Voice sample — singing (chorus) | `13_voice_singing.wav` | From keeper Suno/Logic |

## Bandmates (optional for v1)

- `band_drummer_ref.png`
- `band_bassist_ref.png`
- `band_guitarist_ref.png`

## After upload

```bash
pnpm --filter @westbound/studio ingest -- docs/dan-ref-intake/01_hero_portrait.png studio sammy_rane image
```

Mark checklist items in dashboard **Review → Ref intake** when wired.
