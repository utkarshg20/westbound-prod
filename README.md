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
- [Ops: Sync](docs/ops-runbook-sync.md)
- [Ops: YouTube](docs/ops-runbook-youtube.md)
- [Ops: DSP](docs/ops-runbook-dsp.md)
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

## Review API authentication

Review mutations (`/api/review/*`, including master upload) require an access
token in the existing `sb-access-token` or `sb-auth-token` cookie. The middleware
checks that token with Supabase Auth's `getUser` on every mutation; cookie presence
alone does not grant access. Configure `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) for the same project as the dashboard
database. Missing configuration or failed verification blocks the request.
Authentication is enabled even when `REQUIRE_DAN_AUTH` is unset. Set it explicitly
to `false` only for an isolated local stub/demo; that value bypasses authentication.

This is the existing **authenticated project user** policy, not a Dan-only role
or allowlist. The service-role mutation handlers bypass RLS, and the current
magic-link scaffold does not yet establish these session cookies. Before enabling
operator use, finish the login/session flow and confirm that Supabase user
provisioning is restricted to the intended operators. The mutation gate adds an
Auth request per call and does not refresh expired tokens. These checks have been
tested with mocked Auth responses, not a deployed Supabase session.

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
