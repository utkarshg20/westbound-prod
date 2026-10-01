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

`/login` requests a magic link for an existing Supabase user; it does not create
accounts. `/auth/confirm` verifies an email token hash and always redirects to
`/review`. Supabase SSR stores the session in host-only, HttpOnly,
SameSite=Lax `westbound-review` cookies (including chunks when needed). Production
requires an HTTPS `NEXT_PUBLIC_APP_URL`, and those cookies are Secure. Old raw
`sb-access-token` / `sb-auth-token` cookies are no longer accepted; sign in again.

Configure `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_URL` (or
`NEXT_PUBLIC_SUPABASE_URL`) for the same project as the dashboard database.
Auth form posts and review mutations must have an Origin matching
`NEXT_PUBLIC_APP_URL`; local development defaults to `http://localhost:3000`.
The existing `/api/review/*` mutation gate uses Supabase Auth's `getUser`, refreshes
expired sessions through the SDK, and preserves cookie and no-cache headers on
success and failure. Missing configuration or failed verification blocks access.
`REQUIRE_DAN_AUTH` defaults on; set it to `false` only for an isolated local
stub/demo. This bypass does not send sign-in emails or bypass Supabase login.

Sign-out at `/login` ends the current Supabase session and clears this browser's
cookies. If the Auth service fails, local cookies are still cleared and the page
reports that remote sign-out was not confirmed. Previously issued access tokens
are not claimed to become universally invalid immediately.

Before deployment, an administrator must verify the Site URL/redirect settings,
intended operator roster, signup/anonymous-access policy and the Magic Link email
template. The supported template link is:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a>
```

This remains the existing **authenticated project user** policy, not a Dan-only
role or allowlist. `shouldCreateUser:false` protects this form; it does not disable
other signup routes in the Supabase project. Service-role data handlers are
unchanged and bypass RLS. Protected scope is still review mutations, not all
dashboard pages or other APIs. Link requests use the SDK without session storage
and return the same response for account-specific provider outcomes. Session
storage starts only after token-hash confirmation. No hosted settings or email
templates were changed.
Tests exercise the actual routes and Supabase SDK against controlled Auth protocol
responses; deployed login and actual email delivery remain unverified.

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
