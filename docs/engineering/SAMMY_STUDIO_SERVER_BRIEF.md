# Sammy Studio Server — engineering brief (25 Sep 2026)

**Build the engine, rent the models.** The studio server owns the cast, the rules, the assets, the cut and Dan's verdicts. OpenArt, Kling, MiniMax and whatever comes next are plug-in providers behind one interface. Swapping a vendor is a config change. The model (Claude) is the operator; it only ever talks to the engine.

Rendered version with tables: `handoff/engineering/SAMMY_STUDIO_SERVER_BRIEF.html` (also at https://claude.ai/artifact/Bckcn1aFFWKGSDZShwGpev once shared).

## What we do today, in one pass
1. **Song and map.** Master WAV locked. A vocal map (Demucs stem, 50 ms envelope) says where singing is; gaps get band shots, sung phrases get Sammy lip-synced.
2. **Stills.** Every shot starts as a still on OpenArt with the saved Characters attached (Sammy, Cass, Max, Rex, Tre, the violinist), gated against the locked hero photos before any video credit (`build/hero_gate.py`).
3. **Motion.** Sammy close-ups: MiniMax H3 with the vocal slice as audio. Band: Motion Sync (a still + a driver clip of a real player, retimed so their strokes land on the song's beat). Characters and Motion Sync exist only on the OpenArt website.
4. **Check on landing.** `xc_check.py` (audio offset by cross-correlation), `face_audit.py` (faces at full size vs heroes), `beat_check.py`.
5. **Cut.** A JSON sheet drives `build/cut.py` (ffmpeg). Render, full screen, Dan's notes, iterate.
6. **Lock.** Approved cut → read-only archive with checksums, YouTube master, Drive backup, knowledge repo push. Never touched again without the word "unlock".

## Where the time and money go (25 Sep 2026, measured)
- 15–30 browser clicks per band shot through a Chrome extension that drops mid-run. Two uploads silently failed → one take on the wrong driver, one portrait. ~600 credits.
- Babysitting 3–8 min generations and renders.
- Rules living in markdown, re-learned per session (four drummer attempts before two rules were written).
- Hunting and hand-retiming driver clips; shuffling files between folders, Drive and a mirror repo.
- The prototype `build/openart_motion_sync.py` already does one Motion Sync run in 2.5 min with every check passing. That is the proof phase 1 works.

## Phase 1 — build first (pays back in week one)
### 1. OpenArt job runner
A service owning one logged-in browser session (Playwright). Queue, run, verify, poll, download into the store, return file + contact sheet.
```
motion_sync(subject_id, driver_id, prompt) -> take_id, contact_sheet, credits_before, credits_after
image_with_characters(prompt, character_names[], reference_ids[], size) -> still_id
h3_take(frame_id, audio_slice_id, prompt, seconds) -> take_id
job_status(job_id)
```
Before Generate, re-read the page: subject present at the file's own pixel size; driver filename in the page's `<video>` src; prompt as typed. Fail loudly; never generate on a doubt. The day OpenArt's API exposes Characters/Motion Sync, delete the browser behind the same tool names.

### 2. Gates as tools
```
spend_gate(frame_id, people[], via, seconds, audio_id) -> PASS/FAIL + reasons + cost
hero_gate(frame_id, boxes) -> sheet + PASS/FAIL per person
driver_fit(driver_id, subject_id) -> instrument position match, body visibility, lighting
beat_check(take_id, slice_id) -> offset per motion peak
xc_check(take_id, master_id) -> song offset, similarity
```
All exist as scripts under `build/`. Add the two rules from 25 Sep: the driver's instrument must sit where the subject's does; a driver whose body is dark or hidden fails before spending.

## Phase 1b — second
### 3. Asset store
Object storage (R2/S3 or a box in the house) + metadata index: every hero, still, take, driver, slice, cut, export — who is in it, song and second, approval state, checksum, the job that made it. Heroes read-only.
```
find(kind, person, song, section, approved) -> ids
get(id) -> file + metadata
approve(id, by, note) / reject(id, by, note)
lock(cut_id) -> archive, checksums, YouTube master, backup (today's ritual, one call)
```
### 4. Driver library and retimer
Ingest Dan's phone footage and licensed clips, tagged by instrument, framing, tempo, instrument position. `make_driver(clip_id, song_id, start, strokes_per_beat, crop)` runs beat tracking, retime, phase, crop; stores the beat anchor so a take can be beat-phased anywhere in the song.
### 5. Review loop
A page on the studio network: every new take and cut, play, approve / reject / note with timecode. Verdicts land in the store; the model reads `verdicts(since)`.
### 6. Render service
`render(cut_json) -> mp4, sheet, integrity report`; `excerpt(cut_json, from, to)`. `build/cut.py` is the renderer — move it, don't rewrite it.

## Do not build
A video or lip-sync model or any training. An editor. A chat UI.

## How the factory learns
1. **A rejection becomes a check.** Every verdict carries a reason; a repeated reason becomes a gate (`driver_fit`, `subject_aspect`, `body_visible`) with the date and the take that taught it. `LOCKED_RULES.md` has 21 in prose today.
2. **An approval becomes a preset.** Every approved take stores the exact recipe (still, driver, prompt, model, settings, offsets). "Do Cass like the Troubadour" is a lookup.
3. **The numbers route the work.** Credits per approved second, gate pass rate, first-try approval, per vendor per person. Route by the numbers; notice vendor drift before Dan does.

## Phase 2 — the library is the product
After three months the store holds hundreds of approved takes. New deliverables are assembled from them; generation only fills holes.
### 7. Take index and search — person, shot size, action, venue, camera move, aspect, song, synced phrase, beat anchor, visual embedding. `search_takes(query, filters)`, `synced_phrases(song_id)`.
### 8. Derivatives without generation — 2K takes → 1080p punch-ins and reframes (9:16 with subject tracking), speed ramps, one LUT per video, sound-design layer; beat-phased placement (`build/tre_v6.py` prototype). `derive(...)`, `place(...)`.
### 9. Assembly from a brief — propose N cuts obeying the house rules (nothing over 5 s, angle change every cut, sync first, no black), render, put on the review page. `assemble(brief)`, `render(cut_json)`.
### 10. Coverage planner — for a song and venue, which shots do not exist yet, each with the recipe and cost that would fill it. `coverage(song_id, venue_id)`. The credit budget as a list of holes.
### 11. Publishing — masters + platform derivatives (9:16, 1:1, lyric captions) + scheduled posting through the social connector already attached to the model. `publish(export_id, platform, caption, when)`.

**Worked example, month three:** "25 vertical 15-second trailers for the Troubadour song" → synced phrases all exist → search pulls band and venue coverage → assemble proposes 40 cuts → derive reframes to 9:16 → render 40 → Dan approves 25 → publish schedules them. Credits: zero, unless coverage shows a hole.

## Interfaces
MCP over HTTP with a token. Tools idempotent, return ids not paths. Long jobs return a job id + status tool. Files come back as ids the store resolves. Append-only logs with credits before/after every paid call.

## Where the spec lives
Private repo `dpoore12/sammy-rane-studio` (know-how + heroes; media on the Mac and Drive). `build/*.py` are the components as scripts; `LOCKED_RULES.md`, `PLAYBOOK.md`, `handoff/*/DAN_NOTES.md` hold every rule and verdict, dated; `HEROES_LOCKED/` are the five faces, checksummed, read-only forever.

## Gaps a non-engineer would miss (build these in, not on)
1. **The Characters live on OpenArt's servers.** A trained Character cannot be exported. Insurance = the store holds every hero and every approved still at full resolution plus the exact recipe of every take, so the cast can be rebuilt on another vendor from our own files.
2. **Resolution floor.** Motion Sync returns 1280×720; punch-ins and 9:16 reframes from 720p do not hold. On approval, upscale once to 2K (a small credit) and store that as the master take. Derivatives are then free forever.
3. **Tags at intake.** A take without tags is a lost take. Gating and tagging on the way in is mandatory, not optional — this is where "just build it" projects die.
4. **Backup.** 500 takes at 2K is 50–100 GB. Two copies, one off-site, checksummed, for everything — not only for locked cuts.
5. **Rights and account.** Confirm OpenArt/Kling commercial-use terms on outputs; keep the vendor accounts in the company's name with 2FA; record the licence of every driver clip (Pexels/Mixkit are fine for derived motion) and the Suno terms for the songs.

## Phase 3 — own the cast (self-hosted models)
OpenArt and Kling are storefronts for models (Kling, MiniMax H3, Seedance, Veo, Wan). The cast lives on their servers because their Character feature is the only thing holding likeness. To own it:
- **Rent a GPU, don't buy one.** One H100-class box on demand (RunPod / Lambda, ~USD 2–3 per hour, off when idle). Video models need CUDA; a Mac cannot do this.
- **Open-weight models:** Wan 2.2 / Wan Animate (character + motion transfer from a driver clip — the Motion Sync job), Hunyuan Video, LTX for fast previews; LatentSync or MuseTalk for lip-sync at 720p; Real-ESRGAN for the 2K upscale.
- **A LoRA per band member**, trained from `HEROES_LOCKED/` plus the approved stills. That is the cast, as a file we own, that no vendor can delete or change. Rebuilding it on any future model is a re-train from the same files.
- Same provider contract: `wan.motion_sync`, `wan.h3_equivalent`, `latentsync.lip`. Route by the numbers like any other vendor.
- Honest ceiling: open models trail Kling 3 / Veo 3.1 / H3 by a step on photoreal motion; for locked-off concert shots under 5 s with a driver clip, Wan Animate is purpose-built and competitive. Per-take cost at volume is well under a vendor credit.
- **Gemini today:** Dan's Gemini account gives Veo 3.1 (video, native audio, reference images) and Nano Banana Pro (stills) by API — no browser, callable now as a second provider for Sammy shots and stills. It does not do motion transfer or trained characters, so it is a provider, not the insurance.

## What "better than the platforms" means here
We will never out-train Kling, Veo or MiniMax on raw realism; those are nine-figure models and we rent them. We can beat every platform **on Sammy Rane videos specifically**, because they are general and we are not. Five levers, all of which compound with every approved take:
1. **Cast:** a LoRA per member trained on our heroes and our growing set of approved frames beats any vendor's generic Character feature on likeness, and gets better as the library grows.
2. **Sync:** measured to the frame (`xc_check`), best-of-N selection, and a lip-sync model fine-tuned on Sammy's own mouth. Platforms sync a generic mouth.
3. **Motion:** captured from real players filmed to the track, so it is human and on the beat by construction. Platforms guess motion from text.
4. **Taste as data:** every verdict Dan gives trains a small ranking model that orders candidates the way he would and predicts rejections before a render. No platform has his verdicts.
5. **Cut rules:** nothing over 5 s, angle change at every cut, sync first, no black — the cut looks right because the rules are ours and enforced by code.
Measured by: first-try approval rate, sync error in ms, likeness score against the heroes, credits per approved second. These numbers are the proof, and only our engine can compute them on our cast.
Note on "as Claude gets better": the operator model does not learn from a session; the factory is where learning lives (rules as code, presets, verdicts, metrics). A better base model plugs in on top of the same factory and inherits everything it learned.

## Definition of done, phase 1
From "Cass, still 16, driver 22, gap at 1:21", the model makes three tool calls, no browser is visible to anyone, and the take lands in the store with its contact sheet and a PASS from every gate in under five minutes — or a FAIL that names the reason before any credit is spent.
