# Vendor Verification Spike

**Date:** June 2026  
**Owner:** UG  
**Purpose:** Go/no-go decisions before production-money lanes (per Engineering Directive §9).

## Songtradr

| Item | Status | Notes |
|------|--------|-------|
| Briefs API / automated submission | **PENDING** | Email Songtradr re: Briefs API availability under Westbound Studios LLC. Until confirmed: manual upload via dashboard + `brief_submissions` logging. |
| Account under LLC | **DAN** | Operator sets up Songtradr / AudioSparx under LLC. |
| AI music policy | **GO** | Use disclosure in metadata; avoid spam submissions (Layer A gate). |

**Engineering default:** `SongtradrPublisher` adapter with stub + HTTP when `SONGTRADR_API_KEY` set.

## Replicate — Flux 1.1 Pro

| Item | Status | Notes |
|------|--------|-------|
| Official API | **GO** | Replaces Midjourney (no official API in 2026). ~$0.04/image. |
| Env | `REPLICATE_API_TOKEN` | Wired in `packages/adapters/src/replicate-flux-image.ts` + registry |
| Test batch | **READY** | Run `REPLICATE_API_TOKEN=... npx tsx scripts/vendor-test-flux.ts` (20 images) |

**Engineering:** `ReplicateFluxImageGenerator` active when `USE_STUB_ADAPTERS=false` and token set.

## Suno (third-party API)

| Item | Status | Notes |
|------|--------|-------|
| PiAPI / AIMLAPI | **VERIFY** | Run `npx tsx scripts/vendor-test-suno.ts` (5 generations) before DistroKid |
| Env | `SUNO_API_KEY` | `packages/adapters/src/suno.ts` with hardened fetch |
| RIAA litigation risk | **MONITOR** | Backup: Udio adapter stub. Document prompts + human edits for copyright. |

**Engineering default:** Suno adapter with retry/timeout; media bytes land in R2 via `packages/platform/src/media-fetch.ts`.

## Video — Seedance 2.0 Fast vs Kling 3.0 vs Veo

| Provider | Cost (approx) | Use case | Engineering default |
|----------|---------------|----------|---------------------|
| Seedance 2.0 Fast | ~$0.09/sec | Default B-roll | Pending $30 test |
| Kling 3.0 | Per Kling pricing | Character motion | **Default dialogue** in shot router |
| Veo 3 | ~$0.75/sec | Hero establishing only | Stub until keyed |

**Action:** Run side-by-side test via `scripts/vendor-test-video.ts` before changing `youtube-factory.ts` defaults.

**Interim decision (July 2026):** Kling for dialogue, Seedance for volume B-roll (post-test), Veo hero-only.

## YouTube — AI / mass-produced content (May 2026)

| Requirement | Engineering response |
|-------------|---------------------|
| Mass-produced AI loops | Risk-flag music channels; voice channels with editorial layer |
| Unique voices per channel | `channels.elevenlabs_voice_id` UNIQUE |
| Citations | `videos.citations_json` NOT NULL for voice |
| Human involvement signal | `channels.trailer_uploaded_at` gate (Dan 90s on-camera) |
| Upload cadence | `publish_cadence` 4–5/week first 6 months |

**Reference:** YouTube monetization guidelines on repetitive / AI content — re-read Q1 2027.

## DistroKid + DDEX AI disclosure

| Item | Status | Notes |
|------|--------|-------|
| AI music accepted | **GO** | Own rights, no impersonation, credit human creator, DDEX fields |
| CD Baby | **NO** | Prohibits AI |
| TuneCore | **CAUTION** | Policy rejections reported |

**Engineering:** `tracks.metadata.disclosure`, `releases.metadata.ddex_ai_disclosure`.

## Spotify for Artists / S4A editorial

| Item | Status | Notes |
|------|--------|-------|
| S4A API for editorial pitch | **UNCERTAIN** | Operator Brief flags manual web form may be required. Dashboard supports manual “pitched” flag until API verified. |

## Summary go/no-go

| Provider | Decision |
|----------|----------|
| Songtradr | GO (manual/API TBD) |
| Replicate Flux | GO |
| Suno | GO with license verification |
| Seedance/Kling default, Veo hero | GO |
| DistroKid | GO |
| Pond5 / AudioJungle | NO (AI rejection) |
| Midjourney | NO (no official API) |
