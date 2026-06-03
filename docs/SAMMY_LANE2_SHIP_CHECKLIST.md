# Sammy Lane 2 ship gate

Before any public Sammy launch:

- [ ] Continuity check fails closed (A1) — `pnpm test` includes regression
- [ ] Face drift uses embedding client (A2) — calibrated on ≥20 Dan-approved frames
- [ ] All studio/sync LLM responses zod-parsed (A3)
- [ ] Per-agent temperature deployed (A4)
- [ ] Atomic `add_job_cost` (B1)
- [ ] ≥3 internal dry-runs through `dan_review`, zero canon violations
- [ ] Sentry enabled ≥7 days clean logs
- [ ] `launch_disclosure_version` set on studio project metadata
- [ ] DDEX AI disclosure on DistroKid releases
