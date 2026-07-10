# Sammy Lane 2 ship gate

Before any public Sammy launch:

- [x] Continuity check fails closed (A1) — `pnpm test` includes regression
- [x] Face drift uses embedding client (A2) — calibrated on ≥20 Dan-approved frames (run after ref ingest)
- [x] All studio/sync LLM responses zod-parsed (A3)
- [x] Per-agent temperature deployed (A4)
- [x] Atomic `add_job_cost` (B1)
- [ ] ≥3 internal dry-runs through `dan_review`, zero canon violations — `pnpm sammy:dry-runs`
- [ ] Sentry enabled ≥7 days clean logs — set `SENTRY_DSN` on worker deploy
- [x] `launch_disclosure_version` set on studio project metadata — migration `20260706000001`
- [x] DDEX AI disclosure on DistroKid releases — `releases.ddex_ai_disclosure` + adapter
