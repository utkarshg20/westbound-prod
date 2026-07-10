#!/usr/bin/env bash
# Week 0 infrastructure setup helper
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Westbound Week 0 setup"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in credentials"
fi

echo "==> Starting local Redis + n8n"
docker compose up redis n8n -d

echo "==> Installing dependencies"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
else
  npx pnpm@9.15.0 install
fi

echo "==> Building packages"
if command -v pnpm >/dev/null 2>&1; then
  pnpm build
else
  npx pnpm@9.15.0 build
fi

echo ""
echo "Next steps:"
echo "  1. Fill .env with Supabase, R2, Redis, API keys"
echo "  2. Run migrations: pnpm db:migrate"
echo "  3. Seed DB: psql or supabase db reset with seed.sql"
echo "  4. Import n8n workflows from infra/n8n/workflows/"
echo "  5. Start worker: pnpm worker"
echo "  6. Start dashboard: pnpm dashboard"
echo "  7. Verify: pnpm health"
