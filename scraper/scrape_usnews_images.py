#!/usr/bin/env python3
"""
scrape_usnews_images.py — US News photo scraper that drives YOUR Chrome over CDP
(same model as scrape_lease_calculator.py — attaches to a real Chrome session, so
US News's bot protection sees a normal logged-in browser).

It visits each vehicle's US News exterior + interior photo pages, grabs the first
~N full-res image URLs, writes them into scraper/overrides/vehicle_images.yaml,
and can optionally download them via fetch_vehicle_images.py.

SETUP (once):
    pip install playwright pyyaml          # (no `playwright install` needed — we use YOUR Chrome)

RUN — easiest (let it launch + attach to a dedicated-profile Chrome):
    python scraper/scrape_usnews_images.py --start-chrome
    python scraper/scrape_usnews_images.py --start-chrome --download
    python scraper/scrape_usnews_images.py --start-chrome --only tesla-model3-2026

RUN — attach to a Chrome you already started with remote debugging:
    # Windows:  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
    # macOS:    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
    python scraper/scrape_usnews_images.py            # attaches to localhost:9222

If a page needs a cookie/anti-bot click, add --interactive and it pauses so you
can clear it in the window, then press Enter.
"""
from __future__ import annotations
import argparse, subprocess, sys, time
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pip install pyyaml")
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("pip install playwright")

SCRAPER_DIR = Path(__file__).resolve().parent
YAML_PATH   = SCRAPER_DIR / "overrides" / "vehicle_images.yaml"
FETCHER     = SCRAPER_DIR / "processors" / "fetch_vehicle_images.py"

# Reuse the Chrome attach/launch plumbing from the lease/deals scraper.
sys.path.insert(0, str(SCRAPER_DIR / "incentives"))
try:
    from save_deals_with_browser import _default_chrome_path, _start_chrome  # noqa: E402
except Exception:
    def _default_chrome_path() -> str:
        return r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    _start_chrome = None

# vehicle id -> US News make/model slug (verify/fix if one 404s)
USNEWS = {
 'bmw-i4-2026':'bmw/i4','bmw-i5-2026':'bmw/i5','bmw-i7-2026':'bmw/i7','bmw-ix-2026':'bmw/ix',
 'chevrolet-blazer-ev-2026':'chevrolet/blazer-ev','chevrolet-equinox-ev-2026':'chevrolet/equinox-ev',
 'chevrolet-silverado-ev-2026':'chevrolet/silverado-ev','ford-e-transit-2026':'ford/e-transit',
 'ford-f-150-lightning-2026':'ford/f-150-lightning','ford-mustang-mach-e-2026':'ford/mustang-mach-e',
 'hyundai-ioniq-5-2026':'hyundai/ioniq-5','hyundai-ioniq-6-2026':'hyundai/ioniq-6','hyundai-ioniq-9-2026':'hyundai/ioniq-9',
 'kia-ev6-2026':'kia/ev6','kia-ev9-2026':'kia/ev9','lucid-air-2026':'lucid/air','lucid-gravity-2026':'lucid/gravity',
 'mercedes-benz-cla-2026':'mercedes-benz/cla-class',
 'polestar-polestar-2-2026':'polestar/2','polestar-polestar-3-2026':'polestar/3','polestar-polestar-4-2026':'polestar/4',
 'rivian-r1s-2026':'rivian/r1s','rivian-r1t-2026':'rivian/r1t','rivian-r2-2026':'rivian/r2',
 'tesla-cybertruck-2026':'tesla/cybertruck','tesla-model3-2026':'tesla/model-3','tesla-models-2026':'tesla/model-s',
 'tesla-modelx-2026':'tesla/model-x','tesla-modely-2026':'tesla/model-y','toyota-bz-2026':'toyota/bz4x',
 'volkswagen-id-buzz-2026':'volkswagen/id-buzz','volkswagen-id4-2026':'volkswagen/id-4',
}

# Runs in the page: collect the first N normalized US News /object/image/ URLs.
COLLECT_JS = r"""
(N) => {
  const seen = new Set(), out = [];
  const norm = (u) => { try {
    const x = new URL(u, location.href);
    if (!/\/object\/image\//.test(x.pathname)) return null;
    const t = x.searchParams.get('update-time'); x.search='';
    if (t) x.searchParams.set('update-time', t);
    x.searchParams.set('size','responsiveGallery'); x.searchParams.set('format','webp');
    return x.href;
  } catch(e){ return null; } };
  const big = (ss) => { if(!ss) return null; let b=null,bw=-1;
    ss.split(',').forEach(p=>{const[u,w]=p.trim().split(/\s+/);const ww=w?parseInt(w):0;if(u&&ww>=bw){b=u;bw=ww;}}); return b; };
  document.querySelectorAll('img, source').forEach(e=>{
    [e.currentSrc, e.getAttribute('src'), e.getAttribute('data-src'),
     big(e.getAttribute('srcset')), big(e.getAttribute('data-srcset'))].forEach(r=>{
      const n = norm(r); if(!n) return;
      const id = n.split('/object/image/')[1].split('/')[0];
      if(seen.has(id)) return; seen.add(id); out.push(n);
    });
  });
  return out.slice(0, N);
}
"""


def scrape_page(page, url: str, n: int, interactive: bool) -> list[str]:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
    except Exception as e:
        print(f"      goto failed: {e}")
        return []
    for sel in ["#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('I Accept')"]:
        try:
            page.locator(sel).first.click(timeout=1200); break
        except Exception:
            pass
    if interactive:
        input(f"      [interactive] clear any prompt for {url}, then press Enter...")
    for _ in range(6):
        page.mouse.wheel(0, 2200)
        page.wait_for_timeout(450)
    try:
        page.wait_for_selector("img[src*='/object/image/'], img[srcset*='/object/image/']", timeout=4000)
    except Exception:
        pass
    try:
        return page.evaluate(COLLECT_JS, n) or []
    except Exception as e:
        print(f"      collect failed: {e}")
        return []


def q(s) -> str:
    return '"' + str(s).replace('"', '\\"') + '"'


def write_yaml(values: dict):
    L = [
        "# ─────────────────────────────────────────────────────────────────────────────",
        "# vehicle_images.yaml — image sources per vehicle (and per trim).",
        "# Auto-written by scraper/scrape_usnews_images.py (US News galleries, via CDP).",
        "# Re-download into the app:  python scraper/processors/fetch_vehicle_images.py",
        "# ─────────────────────────────────────────────────────────────────────────────",
        "", "defaults:", "  preferLocal: true", "", "vehicles:", "",
    ]
    for vid in sorted(USNEWS):
        slug = USNEWS[vid]
        v = values.get(vid) or {}
        default = v.get("default"); gallery = v.get("gallery") or []; trims = v.get("trims") or {}
        L.append(f"  {vid}:")
        L.append(f"    # exterior: https://cars.usnews.com/cars-trucks/{slug}/photos-exterior")
        L.append(f"    # interior: https://cars.usnews.com/cars-trucks/{slug}/photos-interior")
        L.append(f"    default: {q(default) if default else chr(34)*2}")
        if gallery:
            L.append("    gallery:"); L += [f"      - {q(u)}" for u in gallery]
        else:
            L.append("    gallery: []")
        if trims:
            L.append("    trims:"); L += [f"      {q(k)}: {q(u)}" for k, u in trims.items()]
        else:
            L.append("    trims: {}")
        L.append("")
    YAML_PATH.write_text("\n".join(L) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="single vehicle id")
    ap.add_argument("--per-page", type=int, default=7)
    ap.add_argument("--interactive", action="store_true", help="pause to clear anti-bot/cookie prompts")
    ap.add_argument("--download", action="store_true", help="run fetch_vehicle_images.py afterwards")
    ap.add_argument("--cdp-url", default="http://localhost:9222")
    ap.add_argument("--start-chrome", action="store_true",
                    help="Launch Chrome with remote debugging + a dedicated profile, then attach")
    ap.add_argument("--chrome-path", default=_default_chrome_path())
    ap.add_argument("--debug-port", type=int, default=9222)
    ap.add_argument("--debug-profile", default=str(SCRAPER_DIR / "incentives" / ".chrome-profile"))
    args = ap.parse_args()

    existing = (yaml.safe_load(YAML_PATH.read_text("utf-8")) or {}).get("vehicles", {}) if YAML_PATH.exists() else {}
    values = {k: dict(v) for k, v in existing.items() if isinstance(v, dict)}
    targets = [args.only] if args.only else list(USNEWS)
    ok, empty = [], []

    with sync_playwright() as pw:
        cdp_url = args.cdp_url
        if args.start_chrome:
            if _start_chrome is None:
                sys.exit("Could not import _start_chrome; start Chrome manually with --remote-debugging-port and omit --start-chrome.")
            _start_chrome(args.chrome_path, args.debug_port, args.debug_profile)
            time.sleep(2.5)
            cdp_url = f"http://localhost:{args.debug_port}"

        print(f"Attaching to Chrome at {cdp_url} …")
        browser = None
        for attempt in range(6):
            try:
                browser = pw.chromium.connect_over_cdp(cdp_url); break
            except Exception as e:
                if args.start_chrome and attempt < 5:
                    time.sleep(1.5); continue
                sys.exit(f"Could not attach to Chrome at {cdp_url}: {e}\n"
                         f'Start Chrome with:  "{args.chrome_path}" --remote-debugging-port={args.debug_port}\n'
                         f"or re-run with --start-chrome.")

        ctx = browser.new_context()
        if browser.contexts:
            ctx = browser.contexts[0]
        page = ctx.new_page()
        for vid in targets:
            slug = USNEWS.get(vid)
            if not slug:
                print(f"!! no US News slug for {vid}"); continue
            print(f"→ {vid}  ({slug})")
            ext = scrape_page(page, f"https://cars.usnews.com/cars-trucks/{slug}/photos-exterior", args.per_page, args.interactive)
            print(f"   exterior: {len(ext)}")
            intr = scrape_page(page, f"https://cars.usnews.com/cars-trucks/{slug}/photos-interior", args.per_page, args.interactive)
            print(f"   interior: {len(intr)}")
            if not ext and not intr:
                empty.append(vid); continue
            default = ext[0] if ext else intr[0]
            gallery = (ext[1:] if ext else []) + intr
            values.setdefault(vid, {})
            values[vid].update({"default": default, "gallery": gallery})
            values[vid].setdefault("trims", {})
            ok.append(vid)
            write_yaml(values)            # save after each car (resumable)
            time.sleep(0.4)
        try:
            page.close()                  # leave the user's Chrome open
        except Exception:
            pass

    print(f"\nDone. populated {len(ok)}; no photos for {len(empty)}: {empty}")
    print(f"Wrote {YAML_PATH}")
    if args.download and ok:
        cmd = [sys.executable, str(FETCHER)] + (["--only", args.only] if args.only else [])
        print("Running fetcher:", " ".join(cmd))
        subprocess.run(cmd, check=False)
    elif ok:
        print("Next: python scraper/processors/fetch_vehicle_images.py")


if __name__ == "__main__":
    main()
