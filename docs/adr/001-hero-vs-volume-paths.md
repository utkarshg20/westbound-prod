# ADR-001: Hero vs Volume Production Paths

**Status:** Accepted  
**Date:** 2026-05-17

## Context

Two briefs describe overlapping stacks:

- **UG Technical Brief v2:** Suno Persona, Kling Character ID, Hedra, n8n, Creatomate — optimized for automation volume.
- **Westbound Engine v2:** LoRA + ComfyUI, Logic + iZotope, multi-model video — optimized for cinematic consistency.

## Decision

Use **tiered production paths** on one platform:

| Tier | Use cases | Audio | Visual | Human gate |
|------|-----------|-------|--------|------------|
| **Hero** | Sammy episodes, flagship songs, anchor docs | Suno draft → Logic + Ozone master | LoRA + ComfyUI stills, Kling Character ID motion, Veo establishing, Hedra lip-sync | Dan: keeper song, Resolve grade, publish approve |
| **Volume** | Sync library, YouTube faceless | Suno API batch + automated QA filters | Reused Midjourney loops, Creatomate assembly | Dan: ~1 hr/day sync curation queue |

## Consequences

- `production_runs.metadata.tier` is `hero` or `volume`.
- Hero jobs route through `packages/studio`; volume through `packages/sync-engine` and YouTube factory.
- Shared: `assets`, R2 storage, Supabase state, job queue, dashboard review queues.
- Do not block hero pipeline on sync automation or vice versa.

## Open

- Genre lane (post-grunge vs heartland alt) — resolve with Dan before locking Suno persona v1.
