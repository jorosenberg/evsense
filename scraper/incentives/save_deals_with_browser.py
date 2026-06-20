"""
save_deals_with_browser.py — drive YOUR OWN Chrome to save deals pages per trim.

Edmunds blocks scripted/headless browsers (403). Your real, logged-in Chrome is
treated as a human, so this script drives *that* browser: it opens each vehicle's
deals page, selects every trim in the dropdown, and saves the rendered HTML into
scraper/incentives/deals_html/. Then parse_local_deals.py turns those files into
per-trim incentives.

────────────────────────────────────────────────────────────────────────────
EASIEST: let the script start Chrome with remote debugging, then attach
────────────────────────────────────────────────────────────────────────────
   python scraper/incentives/save_deals_with_browser.py --start-chrome

This launches your Chrome (default exe below) with --remote-debugging-port and a
dedicated, persistent debug profile (kept in scraper/incentives/.chrome-profile,
so it doesn't fight your normal Chrome window). The first time, log into Edmunds
in the window it opens if you want session-specific pricing; it's remembered for
later runs.

────────────────────────────────────────────────────────────────────────────
RECOMMENDED ALT: attach to a Chrome you started yourself
────────────────────────────────────────────────────────────────────────────
1. Fully quit Chrome, then relaunch it with remote debugging enabled:

   Windows (PowerShell) — your install:
     & "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
   (64-bit installs live under "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".)

   macOS:
     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

   Linux:
     google-chrome --remote-debugging-port=9222

2. (Optional) browse to edmunds.com once so the session is warm.
3. Run this script:
     python scraper/incentives/save_deals_with_browser.py
   It opens a NEW tab in your Chrome and saves one HTML file per trim.

────────────────────────────────────────────────────────────────────────────
ALTERNATIVE: let the script launch Chrome with your everyday profile
────────────────────────────────────────────────────────────────────────────
   python scraper/incentives/save_deals_with_browser.py --launch \
       --profile-dir "C:\\Users\\<you>\\AppData\\Local\\Google\\Chrome\\User Data"
(Chrome must be fully closed first — the profile can't be open twice.)

Then build the incentives JSON from the saved files:
   python scraper/incentives/parse_local_deals.py --zip 10005
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import edmunds_incentives as E  # noqa: E402  (deals URL builder, summary path, helpers)

# Common Chrome install locations (Windows 32-bit dir first — the user's path).
CHROME_CANDIDATES = [
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
]


def _default_chrome_path() -> str:
    for p in CHROME_CANDIDATES:
        if Path(p).exists():
            return p
    return CHROME_CANDIDATES[0]  # fall back to the user's known path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright is required. Install with:\n"
          "  pip install playwright\n  python -m playwright install chromium")
    raise

DEALS_DIR = Path(__file__).resolve().parent / "deals_html"


def _slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-") or "trim"


def _load_vehicles(vehicle_filter: str | None, limit: int | None) -> list[dict]:
    if not E.SUMMARY_IN.exists():
        print(f"Missing {E.SUMMARY_IN}")
        return []
    vehicles = json.loads(E.SUMMARY_IN.read_text("utf-8"))
    if vehicle_filter:
        vehicles = [v for v in vehicles if v.get("id") == vehicle_filter]
    if limit:
        vehicles = vehicles[:limit]
    return vehicles


# Some Edmunds "deals" pages cover a whole nameplate that includes BOTH gas and
# electric trims (e.g. the Mercedes CLA: gas CLA 250 / AMG vs the electric
# "CLA … w/EQ Technology"). For those, keep only the trims whose label matches
# this include pattern so we don't pull the gas model's offers into the EV app.
TRIM_INCLUDE = {
    "mercedes-benz-cla-2026": re.compile(r"eq\s*technology|electric|\beq\b", re.I),
}


def _is_blocked(page) -> bool:
    """True if the page is an Akamai/403 'Access Denied' interstitial."""
    try:
        t = (page.title() or "").lower()
    except Exception:
        t = ""
    if "access denied" in t or t.strip().startswith("403"):
        return True
    try:
        txt = (page.inner_text("body") or "")[:800].lower()
    except Exception:
        txt = ""
    return ("access denied" in txt and "permission" in txt) or "unusual activity" in txt


def _goto_deals(page, url: str, trim_delay: float, cooldown: float, retries: int = 2) -> bool:
    """
    Navigate to a deals URL and wait for it to settle. If Edmunds returns a 403
    'Access Denied' wall, cool down and retry (your real browser usually clears
    it after a short pause). Returns True only when a real (non-blocked) page
    loaded — so callers never save the error page.
    """
    for attempt in range(retries + 1):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(int(trim_delay * 1000))
        except Exception as e:
            print(f"   nav error: {e}")
        if not _is_blocked(page):
            return True
        if attempt < retries:
            print(f"   blocked (403) — cooling down {cooldown:.0f}s then retrying…")
            time.sleep(cooldown)
    return False


def _read_options(page, vid: str) -> list[tuple[str, str]]:
    """[(styleId, trimLabel)] from the trim dropdown, filtered to EV trims."""
    try:
        raw = page.eval_on_selector_all(
            "#style-custom-select option",
            "els => els.map(e => [e.value, e.textContent])",
        )
    except Exception:
        return []
    include = TRIM_INCLUDE.get(vid)
    out, seen = [], set()
    for val, txt in raw or []:
        if not (val and val.isdigit()) or val in seen:
            continue
        label = E._clean_trim_label(txt)
        if include and not include.search(txt):  # match against the raw label
            continue
        seen.add(val)
        out.append((val, label))
    return out


def _save(page, vid: str, trim_label: str) -> Path:
    DEALS_DIR.mkdir(parents=True, exist_ok=True)
    fn = DEALS_DIR / f"{vid}__{_slug(trim_label)}.html"
    fn.write_text(page.content(), encoding="utf-8")
    return fn


def _select_trim(page, sid: str, trim_delay: float, cooldown: float) -> bool:
    """
    Switch to a style by navigating to ?styleid=, retrying on 403. Returns True
    only when a real (non-blocked) page is loaded for that style.
    """
    base = page.url.split("?")[0]
    target = f"{base}?styleid={sid}&zipcode={E.DEFAULT_ZIP}"
    return _goto_deals(page, target, trim_delay, cooldown)


def run(vehicles: list[dict], page, per_vehicle_delay: float, trim_delay: float,
        cooldown: float) -> dict:
    report = {"vehicles": 0, "files": 0, "saved": [], "blocked": []}
    for i, v in enumerate(vehicles, 1):
        vid = v.get("id", "?")
        url = E.edmunds_url(v, year_override=2026)  # already includes ?zipcode=
        print(f"[{i}/{len(vehicles)}] {vid} → {url}")

        # Block-aware navigation — never save a 403 'Access Denied' page.
        if not _goto_deals(page, url, trim_delay, cooldown):
            print(f"   skip — still blocked after retries (re-run later for {vid})")
            report["blocked"].append(vid)
            time.sleep(per_vehicle_delay)
            continue

        options = _read_options(page, vid)
        if not options:
            if vid in TRIM_INCLUDE:
                # Filter removed every option (or no EV trim on the page).
                print(f"   no matching EV trim in dropdown — skipping {vid}")
                report["vehicles"] += 1
                time.sleep(per_vehicle_delay)
                continue
            # No dropdown at all — save the single page under a generic trim name.
            f = _save(page, vid, "default")
            report["files"] += 1; report["saved"].append(f.name)
            print(f"   saved {f.name} (no trim dropdown)")
            report["vehicles"] += 1
            time.sleep(per_vehicle_delay)
            continue

        print(f"   {len(options)} trim(s): {', '.join(l for _, l in options)}")
        default_val = None
        try:
            default_val = page.eval_on_selector("#style-custom-select", "e => e.value")
        except Exception:
            pass
        for sid, label in options:
            if sid != default_val:
                if not _select_trim(page, sid, trim_delay, cooldown):
                    print(f"   skip trim '{label}' — blocked")
                    report["blocked"].append(f"{vid}:{label}")
                    continue
            elif _is_blocked(page):
                continue
            f = _save(page, vid, label)
            report["files"] += 1; report["saved"].append(f.name)
            print(f"   saved {f.name}")
            time.sleep(trim_delay)
        report["vehicles"] += 1
        time.sleep(per_vehicle_delay)
    return report


def _start_chrome(chrome_path: str, port: int, profile_dir: str) -> "subprocess.Popen | None":
    """Launch the user's Chrome with remote debugging on a dedicated profile."""
    exe = Path(chrome_path)
    if not exe.exists():
        print(f"Chrome not found at: {chrome_path}\n"
              f"Pass the right path with --chrome-path.")
        return None
    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    args = [str(exe), f"--remote-debugging-port={port}",
            f"--user-data-dir={profile_dir}", "--no-first-run",
            "--no-default-browser-check", "https://www.edmunds.com/"]
    print(f"Starting Chrome:\n  {' '.join(args)}")
    try:
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"Failed to start Chrome: {e}")
        return None
    return proc


def main() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="Save Edmunds deals pages per trim using your own Chrome")
    ap.add_argument("--cdp-url", default="http://localhost:9222",
                    help="Attach to a Chrome started with --remote-debugging-port=9222 (default)")
    ap.add_argument("--start-chrome", action="store_true",
                    help="Start Chrome (at --chrome-path) with remote debugging + a dedicated "
                         "profile, then attach. Easiest option.")
    ap.add_argument("--chrome-path", default=_default_chrome_path(),
                    help="Path to chrome.exe (default: first found; your install is "
                         r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe)")
    ap.add_argument("--debug-port", type=int, default=9222,
                    help="Remote debugging port for --start-chrome (default 9222)")
    ap.add_argument("--debug-profile", default=str(here / ".chrome-profile"),
                    help="Persistent profile dir used by --start-chrome")
    ap.add_argument("--launch", action="store_true",
                    help="Launch Chrome with your everyday profile instead of attaching (Chrome must be closed)")
    ap.add_argument("--profile-dir", default=None,
                    help="Chrome user-data dir for --launch (e.g. %%LOCALAPPDATA%%/Google/Chrome/User Data)")
    ap.add_argument("--channel", default="chrome",
                    help="Browser channel for --launch: chrome | msedge | chrome-beta (default chrome)")
    ap.add_argument("--vehicle", default=None, help="Only this vehicle id")
    ap.add_argument("--max", type=int, default=None, help="Cap number of vehicles")
    ap.add_argument("--zip", default=E.DEFAULT_ZIP, help="ZIP for localization (default 10005)")
    ap.add_argument("--trim-delay", type=float, default=2.0, help="Seconds to wait after each load")
    ap.add_argument("--vehicle-delay", type=float, default=3.0, help="Seconds between vehicles")
    ap.add_argument("--cooldown", type=float, default=30.0,
                    help="Seconds to wait then retry when Edmunds 403-blocks a page (default 30)")
    args = ap.parse_args()

    E.DEFAULT_ZIP = args.zip
    vehicles = _load_vehicles(args.vehicle, args.max)
    if not vehicles:
        print("No vehicles to process.")
        return
    DEALS_DIR.mkdir(parents=True, exist_ok=True)

    chrome_proc = None
    cdp_url = args.cdp_url
    if args.start_chrome:
        chrome_proc = _start_chrome(args.chrome_path, args.debug_port, args.debug_profile)
        if not chrome_proc:
            return
        cdp_url = f"http://localhost:{args.debug_port}"
        print("Waiting for Chrome to come up …")
        time.sleep(4.0)

    with sync_playwright() as pw:
        if args.launch:
            if not args.profile_dir:
                print("--launch requires --profile-dir (your Chrome 'User Data' folder).")
                return
            ctx = pw.chromium.launch_persistent_context(
                args.profile_dir, executable_path=args.chrome_path, headless=False,
                viewport={"width": 1280, "height": 900},
            )
            page = ctx.new_page()
            try:
                rep = run(vehicles, page, args.vehicle_delay, args.trim_delay, args.cooldown)
            finally:
                ctx.close()
        else:
            print(f"Attaching to Chrome at {cdp_url} …")
            browser = None
            for attempt in range(6):
                try:
                    browser = pw.chromium.connect_over_cdp(cdp_url)
                    break
                except Exception as e:
                    if args.start_chrome and attempt < 5:
                        time.sleep(2.0)
                        continue
                    print(f"Could not attach to Chrome at {cdp_url}: {e}\n"
                          f"Start Chrome with:  \"{args.chrome_path}\" --remote-debugging-port={args.debug_port}\n"
                          f"or re-run with --start-chrome (launches it for you).")
                    return
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.new_page()
            rep = run(vehicles, page, args.vehicle_delay, args.trim_delay, args.cooldown)
            try:
                page.close()
            except Exception:
                pass

    print("\n" + json.dumps(rep, indent=2))
    print(f"\nSaved {rep['files']} file(s) for {rep['vehicles']} vehicle(s) into {DEALS_DIR}")
    if rep.get("blocked"):
        print(f"Blocked (403, not saved): {len(rep['blocked'])} — re-run for: "
              f"{', '.join(sorted(set(b.split(':')[0] for b in rep['blocked'])))}")
    print("Now run:  python scraper/incentives/parse_local_deals.py --zip", args.zip)


if __name__ == "__main__":
    main()
