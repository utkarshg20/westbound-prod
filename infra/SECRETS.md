# Secrets management

Use **1Password Business** shared vault `Westbound Studios`:

| Secret | Used by |
|--------|---------|
| Supabase service role | worker, dashboard server actions |
| R2 credentials | worker, asset ingest CLI |
| Anthropic | agents, sync prompt generator |
| Suno, Kling, ElevenLabs, Creatomate | adapters |
| YouTube OAuth refresh token | youtube factory |
| N8N_WEBHOOK_SECRET | n8n → worker |

Never commit `.env`. Copy from `.env.example` locally.
