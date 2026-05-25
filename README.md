# Westbound Studios — Platform

Unified platform for:

- **Sammy Rane studio** — AI-native serialized rockumentary + song drops
- **Sync signal engine** — demand-matched production music
- **YouTube faceless factory** — compounding long-form channels
- **Lane C (future)** — trading schema isolated in `trading.*`

## Quick start

```bash
pnpm install
cp .env.example .env
# Start Redis + n8n
docker compose up redis n8n -d

# Apply migrations (requires Supabase CLI)
cd infra/supabase && supabase db push

# Build all packages
pnpm build

# Dev
pnpm dashboard   # http://localhost:3000
pnpm worker      # http://localhost:3001
```

## Docs

- [ADR-001 Hero vs volume](docs/adr/001-hero-vs-volume-paths.md)
- [Dan ref intake](docs/dan-ref-intake/CHECKLIST.md)
- [Studio POC runbook](docs/studio-poc.md)
- [R2 setup](infra/R2_SETUP.md)
- [Secrets](infra/SECRETS.md)
- [n8n](infra/n8n/README.md)
- [Trading lane (phase 2)](packages/trading/README.md)

## Phase 2 scripts

```bash
pnpm health                    # infra connectivity check
SIGNAL_CSV_PATH=infra/supabase/sample-signals.csv pnpm sync:mvp
pnpm youtube:proof lofi        # 14-day faceless schedule
bash scripts/ingest-dan-refs.sh
```

Set `USE_STUB_ADAPTERS=false` when API keys are configured.

## Worker API

- `POST /api/jobs/enqueue` — n8n → queue (header `x-n8n-secret`)
- `POST /api/studio/poc` — run studio spikes
- `POST /api/studio/vertical-slice` — end-to-end episode slice (stops at `dan_review` by default)

## Structure

```
apps/dashboard    Next.js control plane
apps/worker       BullMQ consumers + HTTP API
packages/platform DB, R2, queue, types
packages/adapters Provider interfaces + stubs
packages/agents   LLM agents (sync + studio)
packages/studio   Sammy pipeline + asset library + YouTube factory
packages/sync-engine
packages/dsp
infra/supabase    Migrations
infra/n8n         Workflow exports
```
