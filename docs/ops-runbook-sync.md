# Ops runbook — Sync Engine

## Daily flow

1. n8n `sync-signal-ingest` → worker `sync.signal_ingest`
2. n8n `sync-generate-batch` → Layer A scoring → curation queue
3. Dan reviews `/review` (~1 hr/day)
4. Approve → `sync.upload_track` → Songtradr
5. n8n `sync-brief-match` → submissions within 24h

## Commands

```bash
# CSV or scraper ingest + generate
SIGNAL_CSV_PATH=infra/supabase/sample-signals.csv pnpm sync:mvp

# Songtradr briefs CSV
SONGTRADR_BRIEFS_CSV=infra/supabase/sample-songtradr-briefs.csv pnpm sync:mvp

# Health
pnpm health
```

## Layer A thresholds

| Score | Action |
|-------|--------|
| ≥85 | Auto-eligible for brief submit after Dan approve |
| 75–84 | Hold for Dan |
| <75 | Discard |

## Hard-fail alerts (`/metrics`)

- `zero_briefs_7d`
- `avg_score_below_70`
- `dlq_elevated`
- `zero_submissions_7d`

## Notes

- Pond5 is fail-closed (AI rejection). Do not route there.
- Curation queue **merges** metadata (preserves `briefScore` / `audioUri`).
