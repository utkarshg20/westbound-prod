# Ops runbook — YouTube factory

## Channel slugs (canonical)

| Slug | Kind | Alias |
|------|------|-------|
| `lofi_compounder` | music | `lofi` |
| `ambient_sleep` | music | `ambient` |
| `rain_rock` | music | — |
| `slow_money` | voice | — |
| `stoic_hour` | voice | — |

## Commands

```bash
# Pre-generate visual loops → R2
pnpm youtube:loops

# 14-day proof (1 music channel)
pnpm youtube:proof lofi_compounder

# Trend hijack (voice channels)
pnpm trend:scrape
```

## Compliance (voice)

- `trailer_uploaded_at` required before monetized publish
- `citations_json` ≥ 2 sources
- Unique `elevenlabs_voice_id` per channel

## n8n

- `youtube-daily.json` — daily assemble (`lofi_compounder`)
- `youtube-title-thumb-rotate.json` — daily CTR swap (set `YT_ROTATE_VIDEO_ID`)
- `trend-hijack.json` — every 15m

## Creatomate

Set `CREATOMATE_API_KEY`, `CREATOMATE_TEMPLATE_FACELESS`, `CREATOMATE_TEMPLATE_SHORTS`.
Renders now poll to completion via `renderAndWait`.
