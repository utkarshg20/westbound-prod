# Ops runbook — DSP / Content ID

## Jobs

| Job | Purpose |
|-----|---------|
| `dsp.release_candidate` | Insert `releases` row + DistroKid publish when keyed |
| `dsp.compilation_batch` | Monthly top approved sync tracks → DistroKid album |
| `identifyy.register` | Fingerprint + Content ID claim (stub without key) |

## Commands

```bash
# Enqueue via worker HTTP
curl -X POST "$WORKER_API_URL/api/jobs/enqueue" \
  -H "Content-Type: application/json" \
  -H "x-n8n-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"type":"dsp.compilation_batch","payload":{}}'
```

## Disclosure

- `releases.ddex_ai_disclosure` = `AI-assisted, human-curated`
- `tracks.metadata.disclosure` set on sync generate

## n8n

- `dsp-compilation-batch.json` — monthly 1st @ 10:00
- `supervisor-outreach.json` — monthly CRM drafts for Dan

## Royalty import

Dashboard `/ops` → CSV: `platform,amount,month,trackTitle`
