"""
greencarscompare_scraper.py — GreenCarsCompare (GCC) rankings + specs scraper.

greencarscompare.com is a JavaScript SPA (Bitrix CMS) — plain HTTP returns an
empty document, so this uses Playwright to render each page before reading the
DOM. robots.txt allows /rankings/ and /cars/ (only /auth/, /bitrix/, /local/,
/upload/ are disallowed), so this is permitted.

WHAT IT DOES
------------
1. For each ranking page (/rankings/<slug>/), render it and read the ranked list.
   Every ranked row links to a car page (/cars/<make>/<model>/...), so we key off
   those anchors: the link gives us the vehicle slug, the row order gives us the
   rank, and the nearby number gives us the metric value.
2. Match each GCC vehicle slug to one of OUR app vehicle ids (vehicles_summary +
   matcher_vehicles) via normalized make+model matching plus a manual alias map.
3. Optionally visit each matched car page to pull full specs + USD pricing +
   cargo volume (best-effort label→value parsing).
4. Write frontend/public/data/gcc_scores.json:
     { "<appVehicleId>": {
         "gccSlug": "...", "gccUrl": "...",
         "gccScoreTotal": 8.7, "gccRankOverall": 4,
         "ranks":  { "rangeEpa": 12, "efficiencyMiPerKwh": 5, ... },
         "values": { "rangeEpa": 318, "topSpeedMph": 115, "horsepower": 225,
                     "weightLbs": 4663, "cargoVolumeCuFt": 27.2, "priceUsd": 35000 }
       }, ... }

IMPORTANT — FIRST-RUN VERIFICATION
----------------------------------
GCC's exact DOM class names aren't published, so the row-value and car-page spec
selectors below are best-effort. Run with --debug first; if values come back
null, adjust ROW_VALUE_SELECTORS / SPEC_LABEL_MAP using --dump-html output.
The anchor (slug + rank) extraction is robust and should work as-is.

RUN
---
    pip install playwright && playwright install chromium
    python scraper/scrapers/greencarscompare_scraper.py
    python scraper/scrapers/greencarscompare_scraper.py --with-specs   # also car pages
    python scraper/scrapers/greencarscompare_scraper.py --debug --limit 20
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
OUT_PATH = DATA_DIR / "vehicle_scores.json"
SUMMARY_PATH = DATA_DIR / "vehicles_summary.json"
MATCHER_PATH = DATA_DIR / "matcher_vehicles.json"

BASE = "https://www.greencarscompare.com"

# Ranking pages → the metric key we store. The composite "gcc-score-total" is
# kept for display/tiebreaker only; per the product owner it must NOT drive the
# browse cargo/size filters (towing inflates large vehicles and misrepresents
# them for EV shoppers).
# Ranking pages → the metric key we store. Limited to the three the product uses:
#   • overall      — composite GCC score (gcc-score-total)
#   • value        — GCC value score (gcc-score-value)
#   • storageMax   — seats-down maximum cargo volume (cargo-volume-maximum).
# Deliberately NOT score-cargo-and-towing (towing inflates large vehicles).
RANKING_PAGES: dict[str, str] = {
    "gcc-score-total": "overall",
    "gcc-score-value": "value",
    "cargo-volume-maximum": "storageMax",
}

# For the score metrics (0–10) we keep the BEST (max) across a model's trims;
# for storageMax (cu ft) we also keep the max.
_SCORE_METRICS = {"overall", "value", "storageMax"}

# Manual GCC-slug → app-vehicle-id aliases for cases normalized matching misses.
# GCC slugs look like "hyundai-ioniq-5" (from /cars/hyundai/ioniq-5/).
SLUG_ALIASES: dict[str, str] = {
    "hyundai-ioniq-5": "hyundai-ioniq-5-2025",
    "hyundai-ioniq-9": "hyundai-ioniq-9-2025",
    "kia-ev6": "kia-ev6-2025",
    "kia-ev9": "kia-ev9-2025",
    "tesla-model-3": "tesla-model3-2025",
    "tesla-model-y": "tesla-modely-2025",
    "tesla-model-s": "tesla-models-2025",
    "tesla-model-x": "tesla-modelx-2025",
    "tesla-cybertruck": "tesla-cybertruck-2025",
    "ford-mustang-mach-e": "ford-mustang-mach-e-2025",
    "ford-f-150-lightning": "ford-f-150-lightning-2025",
    "chevrolet-equinox-ev": "chevrolet-equinox-ev-2025",
    "chevrolet-blazer-ev": "chevrolet-blazer-ev-2025",
    "rivian-r1t": "rivian-r1t-2025",
    "rivian-r1s": "rivian-r1s-2025",
    "toyota-bz": "toyota-bz-2026",
    "toyota-bz4x": "toyota-bz-2026",
    "mercedes-cla": "mercedes-benz-cla-2026",
    "mercedes-benz-cla": "mercedes-benz-cla-2026",
    "volkswagen-id-4": "volkswagen-id4-2025",
    "volkswagen-id-buzz": "volkswagen-id-buzz-2025",
}

# Best-effort selectors for the numeric value shown on a ranking row. Tried in
# order; first match with a number wins. Adjust after a --debug run if needed.
ROW_VALUE_SELECTORS = [
    "[class*='value']", "[class*='score']", "[class*='number']",
    "[class*='rank-value']", ".value", "td:last-child",
]

# Car-page spec label → our key. Matched case-insensitively on the label text.
SPEC_LABEL_MAP = {
    "cargo": "cargoVolumeCuFt",
    "boot": "cargoVolumeCuFt",
    "trunk": "cargoVolumeCuFt",
    "top speed": "topSpeedMph",
    "power": "horsepower",
    "weight": "weightLbs",
    "range": "rangeEpa",
    "price": "priceUsd",
    "msrp": "priceUsd",
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _num(text: str) -> float | None:
    if not text:
        return None
    m = re.search(r"-?\d[\d,]*\.?\d*", text.replace(" ", " "))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _load_app_vehicles() -> list[dict]:
    out: list[dict] = []
    for p in (SUMMARY_PATH, MATCHER_PATH):
        if not p.exists():
            continue
        data = json.loads(p.read_text("utf-8"))
        rows = data if isinstance(data, list) else data.get("vehicles", [])
        for v in rows:
            if v.get("id") and v.get("make") and v.get("model"):
                out.append(v)
    # de-dupe by id
    seen, uniq = set(), []
    for v in out:
        if v["id"] in seen:
            continue
        seen.add(v["id"])
        uniq.append(v)
    return uniq


def _match_slug_to_app(slug: str, app_vehicles: list[dict]) -> str | None:
    """Map a GCC car slug (e.g. 'tesla-model-3-premium-rwd-2025') to an app id.

    GCC slugs are per-trim and include trim + year, so we (1) prefix-match the
    alias table, then (2) check whether an app make+model appears inside the slug.
    """
    # 1) Alias prefix match (most precise).
    for alias_key, app_id in SLUG_ALIASES.items():
        if slug == alias_key or slug.startswith(alias_key + "-"):
            return app_id
    # 2) Normalized containment: the app's make+model appears in the GCC slug.
    ns = _norm(slug)
    best = None
    for v in app_vehicles:
        key = _norm(f"{v['make']}{v['model']}")
        if key and key in ns:
            if best is None or len(key) > len(_norm(f"{best['make']}{best['model']}")):
                best = v
    return best["id"] if best else None


# ── Playwright extraction ─────────────────────────────────────────────────────
def _auto_scroll(page, steps: int = 12, pause_ms: int = 300) -> None:
    """Scroll to the bottom in steps to trigger lazy-loaded ranking rows."""
    for _ in range(steps):
        page.mouse.wheel(0, 4000)
        page.wait_for_timeout(pause_ms)


def _goto_rendered(page, url: str, debug: bool = False,
                   wait_selector: str | None = "table tbody tr[id]",
                   scroll: bool = True, settle_ms: int = 2000) -> bool:
    """Navigate following redirects, then wait for content to render.

    Uses 'domcontentloaded' (not 'networkidle') because the SPA keeps analytics
    sockets open, so the network never goes idle and 'networkidle' always times
    out. `wait_selector` is the element to wait for (the ranking table on rankings
    pages); pass None for ordinary pages (e.g. car detail) to just settle briefly
    instead of waiting out a 30s selector timeout that will never match.
    """
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:  # noqa: BLE001
        if debug:
            print(f"    goto failed ({e}); retrying with 'load'")
        try:
            page.goto(url, wait_until="load", timeout=30000)
        except Exception as e2:  # noqa: BLE001
            print(f"  [warn] could not load {url}: {e2}")
            return False
    if debug and page.url != url:
        print(f"    followed redirect → {page.url}")

    if wait_selector is None:
        page.wait_for_timeout(settle_ms)  # let the SPA paint, no long wait
        return True

    # Wait for the ranking table rows. Each ranked vehicle is a
    # <tr class="item" id="<car-slug>" data-value="<metric>"> with a .place cell.
    try:
        page.wait_for_selector(wait_selector, timeout=30000)
    except Exception:
        _auto_scroll(page, steps=6)
        try:
            page.wait_for_selector(wait_selector, timeout=15000)
        except Exception:
            if debug:
                print(f"    selector '{wait_selector}' not found")
            return False
    if scroll:
        _auto_scroll(page)  # pull in the full ranked list
    return True


def _extract_ranking(page, slug: str, debug: bool = False, dump_html: bool = False) -> list[dict]:
    """Return ordered [{slug, url, value}] for one ranking page."""
    url = f"{BASE}/rankings/{slug}/"
    if not _goto_rendered(page, url, debug=debug):
        return []

    if dump_html:
        dump_path = REPO_ROOT / "scraper" / "reports" / f"gcc_dump_{slug}.html"
        dump_path.parent.mkdir(parents=True, exist_ok=True)
        dump_path.write_text(page.content(), encoding="utf-8")
        print(f"    dumped rendered HTML → {dump_path}")

    # Each ranked vehicle is a table row carrying everything we need:
    #   <tr class="item" id="<car-slug>" data-value="<metric>">
    #     <td class="place">1.</td> ... </tr>
    rows = page.eval_on_selector_all(
        "table tbody tr[id]",
        """els => els.map(tr => ({
            slug: tr.getAttribute('id') || '',
            dataValue: tr.getAttribute('data-value'),
            place: (tr.querySelector('.place') ? tr.querySelector('.place').innerText : ''),
        }))""",
    )
    if debug:
        print(f"  [{slug}] {len(rows)} table rows; sample: {rows[:2]}")

    out, seen = [], set()
    for r in rows:
        car_slug = (r.get("slug") or "").strip().lower()
        if not car_slug or car_slug in seen:
            continue
        seen.add(car_slug)
        rank = int(_num(r.get("place")) or (len(out) + 1))
        out.append({
            "slug": car_slug,
            "url": f"{BASE}/car/{car_slug}/",
            "rank": rank,
            "value": _num(r.get("dataValue")),
        })
    return out


def _extract_car_specs(page, url: str, debug: bool = False) -> dict:
    """Best-effort label→value spec + price scrape from a car detail page.

    Car pages have no ranking table, so we pass wait_selector=None to just settle
    briefly — otherwise we'd wait out a 45s selector timeout on every car page.
    """
    if not _goto_rendered(page, url, debug=debug, wait_selector=None, scroll=False, settle_ms=2500):
        return {}
    body = page.eval_on_selector("body", "el => el.innerText") or ""
    specs: dict = {}
    for line in body.splitlines():
        low = line.lower()
        for label, key in SPEC_LABEL_MAP.items():
            if label in low and key not in specs:
                val = _num(line)
                if val is not None:
                    specs[key] = val
    return specs


def scrape(with_specs: bool = False, limit: int | None = None, debug: bool = False,
           dump_html: bool = False) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError("playwright not installed. Run: pip install playwright && playwright install chromium")

    app_vehicles = _load_app_vehicles()
    if debug:
        print(f"Loaded {len(app_vehicles)} app vehicles to match against.")

    # app vehicle id → aggregated GCC record (best rank across all its trims)
    matched: dict[str, dict] = {}
    unmatched: set[str] = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ))
        # Block heavy assets — speeds rendering and avoids hanging connections.
        page.route(
            re.compile(r"\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm|avif)(\?|$)", re.I),
            lambda route: route.abort(),
        )

        for i, (slug, metric) in enumerate(RANKING_PAGES.items()):
            try:
                rows = _extract_ranking(page, slug, debug=debug, dump_html=dump_html and i == 0)
            except Exception as e:  # noqa: BLE001
                print(f"  [warn] ranking '{slug}' failed: {e}")
                continue
            for r in rows:
                app_id = _match_slug_to_app(r["slug"], app_vehicles)
                if not app_id:
                    unmatched.add(r["slug"])
                    continue
                val = r["value"]
                if val is None:
                    continue
                rec = matched.setdefault(app_id, {"gccSlug": r["slug"], "gccUrl": r["url"]})
                # A model has several GCC trims; keep the best (max) per metric.
                if metric not in rec or val > rec[metric]:
                    rec[metric] = val
                    if metric == "overall":
                        rec["gccSlug"] = r["slug"]
                        rec["gccUrl"] = r["url"]

        browser.close()

    return {
        "source": "greencarscompare.com",
        "scrapedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rankingPages": list(RANKING_PAGES.keys()),
        "matchedCount": len(matched),
        "unmatchedCount": len(unmatched),
        "unmatchedSlugs": sorted(unmatched)[:50],
        "vehicles": matched,
    }


def write(payload: dict, out_path: Path = OUT_PATH) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape GreenCarsCompare rankings + specs.")
    ap.add_argument("--with-specs", action="store_true", help="Also visit car pages for cargo/price specs")
    ap.add_argument("--limit", type=int, default=None, help="Cap car-page visits (debugging)")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--dump-html", action="store_true",
                    help="Save the first ranking page's rendered HTML to scraper/reports/ for inspection")
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    payload = scrape(with_specs=args.with_specs, limit=args.limit, debug=args.debug,
                     dump_html=args.dump_html)
    write(payload, out_path=Path(args.out))
    print(f"Wrote {args.out}")
    print(f"  matched {payload['matchedCount']} app vehicles; "
          f"{len(payload['unmatchedSlugs'])} GCC slugs unmatched")
    if payload["unmatchedSlugs"] and args.debug:
        print("  unmatched sample:", payload["unmatchedSlugs"][:15])


if __name__ == "__main__":
    main()
