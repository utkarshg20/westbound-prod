#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in Supabase/R2 keys."
fi

echo "Starting Redis + n8n..."
docker compose up redis n8n -d

echo "Build packages..."
npx pnpm@9.15.0 install
npx pnpm@9.15.0 build

echo ""
echo "Next steps:"
echo "  1. Apply DB: cd infra/supabase && supabase db push && psql \$DATABASE_URL -f seed.sql"
echo "  2. Terminal A: npx pnpm@9.15.0 worker"
echo "  3. Terminal B: npx pnpm@9.15.0 dashboard"
echo "  4. Health:   npx tsx scripts/check-health.ts"
