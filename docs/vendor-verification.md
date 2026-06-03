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
| Env | `REPLICATE_API_TOKEN` | Wire in `packages/adapters/src/replicate-flux.ts` |

**Action:** Run 20-image test batch before Week 7 YouTube factory.

## Suno (third-party API)

| Item | Status | Notes |
|------|--------|-------|
| PiAPI / AIMLAPI | **VERIFY** | Test 5 generations; confirm commercial license for DistroKid. |
| Env | `SUNO_API_KEY` or provider-specific | Existing `packages/adapters/src/suno.ts` |
| RIAA litigation risk | **MONITOR** | Backup: Udio adapter stub. Document prompts + human edits for copyright. |

**Engineering default:** Suno adapter with retry/timeout (B5 template).

## Video — Seedance 2.0 Fast vs Kling 3.0 vs Veo

| Provider | Cost (approx) | Use case |
|----------|---------------|----------|
| Seedance 2.0 Fast | ~$0.09/sec | Default B-roll |
| Kling 3.0 | Per Kling pricing | Character motion |
| Veo 3 | ~$0.75/sec | Hero establishing only |

**Action:** $30 side-by-side test before locking defaults in `youtube-factory.ts`.

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
