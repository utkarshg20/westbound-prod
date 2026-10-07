# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.45", "requests", "pillow"]
# ///
"""OpenArt Motion Sync, as one command (Dan, 25 Sep 2026: "build it").

  uv run build/openart_motion_sync.py --subject FRAME.png --driver CLIP.mp4 --prompt "..." --out handoff/tre/takes/t_X_ms.mp4 \
      --people cass --frame handoff/tre/frames/APPROVED/16_cass_alone_16x9.png [--audio SLICE.mp3] [--dry-run]

What it does, and checks, in order (every check is one of the traps that cost a take on 25 Sep):
  0. ONE-TIME: uv run build/openart_motion_sync.py --login  (opens the studio's own Chrome profile; Dan signs in to OpenArt there once)
  1. SPEND GATE: runs build/spend_gate.py --via web with --frame/--people/--audio; refuses if it fails.
  2. Attaches to Dan's own Chrome over CDP (Chrome must be running with --remote-debugging-port=9222; see relaunch_chrome()).
     Falls back to a persistent Playwright Chrome profile in .pw-chrome (log in to OpenArt there once) with --profile.
  3. Opens Video > Motion Sync, uploads the SUBJECT (converted to a <=10 MB JPEG, width capped at 2752) and VERIFIES the
     page shows it at the file's own size (the page can silently swap the subject back to a portrait hero).
  4. Uploads the DRIVER through the tool's own input and VERIFIES the page's <video> src is that file; if the tool dropped
     it, retries through History > Uploads.
  5. Types the prompt, re-verifies subject + driver + prompt, reads the credit balance, presses Generate (not on --dry-run).
  6. Polls until the new tile appears (or "Failed"), downloads it to --out, writes <out>_contact.jpg, prints duration/size/cost.
Nothing here regenerates an approved take: --out must not already exist.
"""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path

S = Path(__file__).resolve().parent.parent          # the studio
CDP = "http://127.0.0.1:9222"
MOTION_SYNC = "https://openart.ai/suite/motion-sync/kling-v3"

def log(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)

def spend_gate(a):
    cmd = ["uv", "run", "--quiet", str(S / "build/spend_gate.py"), "--frame", a.frame, "--people", a.people, "--via", "web",
           "--seconds", "6", "--what", f"motion_sync:{Path(a.out).stem}"] + (["--audio", a.audio] if a.audio else [])
    r = subprocess.run(cmd, cwd=S, capture_output=True, text=True); print(r.stdout.strip())
    if r.returncode != 0: sys.exit("spend gate FAILED — fix what it says, then run again")

def subject_jpeg(path):
    """OpenArt's picker takes <=10 MB; the 4K PNGs are 18 MB. Same pixels, JPEG, width capped at 2752."""
    from PIL import Image
    im = Image.open(path).convert("RGB"); w, h = im.size
    if w > 2752: im = im.resize((2752, int(h * 2752 / w)), Image.LANCZOS)
    out = S / "handoff/_uploads" / (Path(path).stem + "_subject.jpg"); out.parent.mkdir(exist_ok=True)
    im.save(out, quality=92); return out, im.size

def relaunch_chrome():
    """Quit Chrome and start it with remote debugging so the driver can use Dan's logged-in session. Tabs restore."""
    subprocess.run(["osascript", "-e", 'quit app "Google Chrome"']); time.sleep(3)
    subprocess.run(["open", "-a", "Google Chrome", "--args", "--remote-debugging-port=9222"]); time.sleep(6)

def connect(pw, cdp=False):
    """Default: the studio's own Chrome profile (.pw-chrome), logged in to OpenArt once with --login. Chrome 136+ refuses
    remote debugging on Dan's everyday profile, so --cdp only works if Chrome was started with a separate --user-data-dir."""
    if cdp:
        b = pw.chromium.connect_over_cdp(CDP); ctx = b.contexts[0]; return b, ctx.new_page()
    kw = dict(headless=False, viewport={"width": 1500, "height": 900}, args=["--disable-blink-features=AutomationControlled"])
    exe = chrome_binary()
    if exe: kw["executable_path"] = exe
    else: kw["channel"] = "chrome"
    ctx = pw.chromium.launch_persistent_context(str(S / ".pw-chrome"), **kw)
    return ctx, (ctx.pages[0] if ctx.pages else ctx.new_page())

def chrome_binary():
    """Dan's Chrome is not in /Applications (it runs translocated from wherever it was downloaded); find the real bundle."""
    for p in [os.environ.get("CHROME_BIN", "")] + [l + "/Contents/MacOS/Google Chrome" for l in
              subprocess.run(["mdfind", "kMDItemCFBundleIdentifier == 'com.google.Chrome'"], capture_output=True, text=True).stdout.split("\n")]:
        if p and os.path.exists(p): return p
    # Spotlight cannot see a translocated bundle; take the path of the Chrome that is running right now
    ps = subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True).stdout
    m = re.search(r"(/.*?/Google Chrome\.app/Contents/MacOS/Google Chrome)", ps)
    return m.group(1) if m and os.path.exists(m.group(1)) else None

def login_once(pw):
    """Opens OpenArt in the studio profile and waits for Dan to sign in (his hands, his password). Exits when the workspace shows."""
    ctx, page = connect(pw); page.goto("https://openart.ai/suite/home", wait_until="domcontentloaded")
    log("sign in to OpenArt in the window that just opened (Google or email); waiting up to 15 min")
    for _ in range(180):
        page.wait_for_timeout(5000)
        try:
            if re.search(r"workspace|\b\d{1,3},\d{3}\b", page.locator("body").inner_text()[:3000]) and "/login" not in page.url and "Sign in" not in page.title():
                log("logged in — the session is saved in .pw-chrome"); ctx.close(); return
        except Exception: pass
    sys.exit("not logged in after 15 min")

def credits(page):
    m = re.search(r"\b(\d{1,3}(?:,\d{3})+)\b", page.locator("header, body").first.inner_text()[:2000]); return m.group(1) if m else "?"

def page_state(page):
    return page.evaluate("""() => ({
        subj: [...document.querySelectorAll('img')].filter(i=>/_subject_/.test(i.src)).map(i=>[i.naturalWidth,i.naturalHeight,i.src.split('/').pop()])[0]||null,
        drv: [...document.querySelectorAll('video')].map(v=>(v.currentSrc||v.src).split('/').pop()).filter(Boolean)[0]||null,
        prompt: (document.querySelector('[contenteditable=true]')||{}).innerText||'',
        generating: (document.body.innerText.match(/Generating/g)||[]).length,
        failed: (document.body.innerText.match(/Failed/g)||[]).length,
        outputs: [...document.querySelectorAll('video')].map(v=>(v.currentSrc||v.src)).filter(u=>/cdn\\.openart|output|interpolated|kling/i.test(u)&&!/driver_|_subject_/.test(u)),
    })""")

def upload_driver_via_history(page, driver):
    """Fallback: the tool's own input dropped the file. Upload through History > Uploads and pick the newest tile."""
    page.locator('button[aria-label="History"]').first.click(); page.wait_for_timeout(1500)
    page.get_by_text("Uploads", exact=True).first.click(); page.wait_for_timeout(1500)
    dlg_input = page.locator('input[type=file][accept*="mp4"]').last; dlg_input.set_input_files(str(driver)); page.wait_for_timeout(12000)
    page.locator('[role=dialog] video, video').first.click(); page.wait_for_timeout(2000); page.keyboard.press("Escape")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", required=True); ap.add_argument("--driver", required=True); ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--people", required=True); ap.add_argument("--frame", required=True)
    ap.add_argument("--audio"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--cdp", action="store_true")
    ap.add_argument("--timeout", type=int, default=720)
    if "--login" in sys.argv:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw: login_once(pw)
        return
    a = ap.parse_args()
    out = Path(a.out) if os.path.isabs(a.out) else S / a.out
    if out.exists(): sys.exit(f"{out} exists — never regenerate a take that is already on disk (rename or pick a new --out)")
    driver = Path(a.driver).resolve(); assert driver.exists() and driver.stat().st_size < 100e6, "driver missing or >100 MB"
    spend_gate(a)
    subj, (sw, sh) = subject_jpeg(a.subject); log(f"subject {subj.name} {sw}x{sh}")
    from playwright.sync_api import sync_playwright
    import requests
    with sync_playwright() as pw:
        b, page = connect(pw, a.cdp)
        page.goto(MOTION_SYNC, wait_until="domcontentloaded"); page.wait_for_timeout(4000)
        for _ in range(3):   # the suite likes to reopen the last creation in a viewer over the tool; close it
            if page.locator("text=Recreate video").count() or page.locator("text=Use in Chat").count():
                page.keyboard.press("Escape"); page.wait_for_timeout(1000)
                for sel in ('button[aria-label="Close"]', 'button:has(svg) >> nth=0'):
                    try: page.locator(sel).first.click(timeout=1500); break
                    except Exception: pass
                page.wait_for_timeout(1500)
            if page.locator('input[type=file][accept*="jpg"]').count(): break
            page.wait_for_timeout(4000)
        try:
            page.wait_for_selector('input[type=file][accept*="jpg"]', state="attached", timeout=60000)   # file inputs are hidden by design
        except Exception:
            dbg = S / "handoff/tre/tests/pw_debug.png"; page.screenshot(path=str(dbg))
            sys.exit(f"Motion Sync page did not show its file inputs: url={page.url} title={page.title()!r}; screenshot {dbg}")
        page.wait_for_timeout(2000)
        page.locator('input[type=file][accept*="jpg"]').first.set_input_files(str(subj)); page.wait_for_timeout(6000)
        st = page_state(page)
        if not st["subj"] or st["subj"][0] != sw: sys.exit(f"SUBJECT CHECK FAILED: page shows {st['subj']} not {sw}x{sh} — not generating")
        log("subject verified", st["subj"])
        page.locator('input[type=file][accept*="mp4"]').first.set_input_files(str(driver)); page.wait_for_timeout(12000)
        st = page_state(page)
        if not st["drv"] or driver.stem not in st["drv"]:
            log("tool input dropped the driver; going through History > Uploads"); upload_driver_via_history(page, driver); page.wait_for_timeout(2000); st = page_state(page)
        if not st["drv"] or driver.stem not in st["drv"]: sys.exit(f"DRIVER CHECK FAILED: page shows {st['drv']} — not generating")
        log("driver verified", st["drv"])
        ed = page.locator('[contenteditable=true]').first; ed.click(); page.keyboard.press("Meta+A"); page.keyboard.press("Delete"); page.keyboard.type(a.prompt, delay=5)
        page.wait_for_timeout(800); st = page_state(page)
        ok = st["subj"] and st["subj"][0] == sw and st["drv"] and driver.stem in st["drv"] and a.prompt[:30] in st["prompt"]
        if not ok: sys.exit(f"FINAL CHECK FAILED: {json.dumps(st)[:400]}")
        before = credits(page); seen = set(st["outputs"]); failed0 = st["failed"]
        log(f"all checks pass; credits {before}; {'DRY RUN — not pressing Generate' if a.dry_run else 'pressing Generate'}")
        if a.dry_run: return
        page.get_by_role("button", name=re.compile(r"^Generate")).first.click(); page.wait_for_timeout(5000)
        t0 = time.time(); url = None
        while time.time() - t0 < a.timeout:
            st = page_state(page); new = [u for u in st["outputs"] if u not in seen]
            if st["failed"] > failed0: sys.exit("OpenArt reported Failed (credits are refunded by them) — driver probably too dark or hidden")
            if new and st["generating"] == 0: url = new[0]; break
            time.sleep(10)
        if not url: sys.exit("timed out waiting for the take; check the OpenArt page")
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "wb") as f: f.write(requests.get(url, timeout=300).content)
        after = credits(page); log(f"saved {out} ({out.stat().st_size/1e6:.1f} MB); credits {before} -> {after}")
        subprocess.run(["uv", "run", "--quiet", "--with", "av", "--with", "pillow", "python", "-c", f"""
import av; from PIL import Image
c=av.open('{out}'); s=c.streams.video[0]; print('take', round(float(c.duration/av.time_base),2),'s', s.width,'x',s.height)
want=[i*0.5 for i in range(12)]; got={{}}
for fr in c.decode(s):
    t=float(fr.pts*s.time_base)
    for w in want:
        if w not in got and t>=w-0.01: got[w]=fr.to_image()
    if len(got)==len(want): break
W,H=got[0].size; sh=Image.new('RGB',(W*4,H*3))
for i,w in enumerate(want):
    if w in got: sh.paste(got[w],((i%4)*W,(i//4)*H))
sh.save('{out.with_suffix("")}_contact.jpg',quality=88)"""], cwd=S)
        with open(S / "build/hooks/generation.log", "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  MOTION_SYNC  {out.name}  subject={subj.name}  driver={driver.name}  credits {before}->{after}\n")

if __name__ == "__main__":
    main()
