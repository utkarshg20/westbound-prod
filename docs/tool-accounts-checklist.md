# Tool accounts checklist (Week 0)

| Service | Owner | Env var | Status |
|---------|-------|---------|--------|
| Supabase | UG | `SUPABASE_*` | [ ] |
| Cloudflare R2 | UG | `R2_*` | [ ] |
| Redis / Upstash | UG | `REDIS_URL` | [ ] |
| Anthropic | UG | `ANTHROPIC_API_KEY` | [ ] |
| Suno | Dan/UG | `SUNO_API_KEY` | [ ] |
| Kling | UG | `KLING_API_KEY` | [ ] |
| ElevenLabs | UG | `ELEVENLABS_*` | [ ] |
| Hedra | UG | `HEDRA_API_KEY` | [ ] |
| Creatomate | UG | `CREATOMATE_*` | [ ] |
| YouTube OAuth | UG | `YOUTUBE_*` | [ ] |
| DistroKid | Dan | `DISTROKID_API_KEY` | [ ] |
| Songtradr | Dan | `SONGTRADR_API_KEY` | [ ] |
| Identifyy | Dan | manual | [ ] |
| 1Password vault | Dan | shared | [ ] |

When all keys are in `.env`, set `USE_STUB_ADAPTERS=false`.
