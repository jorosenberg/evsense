"""
edmunds_reviews_scraper.py — Edmunds trims + Expert Rating scraper.

Edmunds model pages (e.g. https://www.edmunds.com/tesla/model-y/) are
SERVER-SIDE RENDERED: a plain HTTP GET returns the full Expert Rating, all seven
subscores, and the trim <select> in the HTML. (A headless browser, by contrast,
gets bot-challenged and returns nothing — so we deliberately use a plain HTTP
request with browser-like headers and parse the static markup.)

PER MODEL IT EXTRACTS
---------------------
  • overall   — the Expert Rating badge (e.g. 8.2) from <div class="rating-text ...">
  • subscores — each scorecard section's <h2> label + <strong> score:
                  Driving experience, Comfort, In-cabin tech, Storage & cargo,
                  Value, Range/Efficiency/Charging, X factor
  • trims     — <select data-tracking-id="trim_select"> options:
                  "Premium - $43,880 MSRP" → {name, msrp}

OUTPUT  →  frontend/public/data/edmunds_ratings.json
  { "vehicles": { "<appVehicleId>": {
        "overall": 8.2,
        "subscores": { "driving":8.5, "comfort":8.0, "tech":7.6, "storage":9.4,
                       "value":8.4, "range":7.0, "xfactor":7.0 },
        "trims": [ { "name":"Base", "msrp":41380 }, ... ],
        "edmundsUrl": "..." } } }

The app surfaces these generically as an "Expert rating" — the provider is not
named in the UI.

RUN
---
    python scraper/scrapers/edmunds_reviews_scraper.py --debug
    python scraper/scrapers/edmunds_reviews_scraper.py --only tesla-model-y-2025
"""

from __future__ import annotations

import argparse
import html as _html
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
OUT_PATH = DATA_DIR / "edmunds_ratings.json"
SUMMARY_PATH = DATA_DIR / "vehicles_summary.json"

BASE = "https://www.edmunds.com"

# app vehicle id → edmunds "<make>/<model>" path. Override irregular slugs here.
PATH_OVERRIDES: dict[str, str] = {
    "tesla-model3-2025": "tesla/model-3",
    "tesla-modely-2025": "tesla/model-y",
    "tesla-models-2025": "tesla/model-s",
    "tesla-modelx-2025": "tesla/model-x",
    "tesla-cybertruck-2025": "tesla/cybertruck",
    "hyundai-ioniq-5-2025": "hyundai/ioniq-5",
    "hyundai-ioniq-6-2025": "hyundai/ioniq-6",
    "hyundai-ioniq-9-2025": "hyundai/ioniq-9",
    "kia-ev6-2025": "kia/ev6",
    "kia-ev9-2025": "kia/ev9",
    "ford-mustang-mach-e-2025": "ford/mustang-mach-e",
    "ford-f-150-lightning-2025": "ford/f-150-lightning",
    "ford-e-transit-2025": "ford/e-transit",
    "chevrolet-equinox-ev-2025": "chevrolet/equinox-ev",
    "chevrolet-blazer-ev-2025": "chevrolet/blazer-ev",
    "chevrolet-silverado-ev-2025": "chevrolet/silverado-ev",
    "volkswagen-id4-2025": "volkswagen/id4",
    "volkswagen-id-buzz-2025": "volkswagen/id-buzz",
    "polestar-polestar-2-2025": "polestar/polestar-2",
    "polestar-polestar-3-2025": "polestar/polestar-3",
    "polestar-polestar-4-2025": "polestar/polestar-4",
    "toyota-bz-2026": "toyota/bz",
    "mercedes-benz-cla-2026": "mercedes-benz/cla",
}

SUBSCORE_LABELS = {
    "driving experience": "driving",
    "comfort": "comfort",
    "in-cabin tech": "tech",
    "storage & cargo": "storage",
    "value": "value",
    "range/efficiency/charging": "range",
    "x factor": "xfactor",
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Referer": "https://www.edmunds.com/",
}


def _slug(s: str) -> str:
    s = (s or "").lower().strip().replace(".", "-").replace(" ", "-")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9-]+", "", s)).strip("-")


def _edmunds_path(v: dict) -> str:
    return PATH_OVERRIDES.get(v["id"]) or f"{_slug(v.get('make'))}/{_slug(v.get('model'))}"


def _load_app_vehicles() -> list[dict]:
    if not SUMMARY_PATH.exists():
        return []
    data = json.loads(SUMMARY_PATH.read_text("utf-8"))
    return [v for v in data if v.get("id") and v.get("make") and v.get("model")]


# ── HTTP ──────────────────────────────────────────────────────────────────────
# Edmunds sits behind Akamai Bot Manager. A cold request gets a 16KB 403 block
# page; once a valid `ak_bmsc` cookie is held the requests pass. We use a
# curl_cffi Session (Chrome TLS/JA3 impersonation) and WARM IT UP by hitting the
# homepage first so Akamai issues the cookie, then reuse the session per model.
_MIN_OK_LEN = 20000  # the real SSR review page is >100KB; block pages are ~2-16KB


def make_session(debug: bool = False):
    try:
        from curl_cffi import requests as cf  # type: ignore
    except ImportError:
        if debug:
            print("  curl_cffi not installed (pip install curl_cffi) — Edmunds will block plain HTTP")
        return None
    for target in ("chrome131", "chrome124", "chrome120", "chrome"):
        try:
            s = cf.Session(impersonate=target)
            s.headers.update({"Accept-Language": "en-US,en;q=0.9",
                              "Referer": "https://www.edmunds.com/"})
            # Warm-up: collect Akamai cookies (ak_bmsc, bm_sv, etc.).
            s.get("https://www.edmunds.com/", timeout=30, allow_redirects=True)
            s.get("https://www.edmunds.com/electric-car/", timeout=30, allow_redirects=True)
            if debug:
                ck = "; ".join(sorted(c.name for c in s.cookies.jar)) if hasattr(s.cookies, "jar") else "?"
                print(f"  warmed curl_cffi session [{target}]; cookies: {ck[:120]}")
            return s
        except Exception as e:  # noqa: BLE001
            if debug:
                print(f"  session warm-up [{target}] failed: {e}")
    return None


def _fetch_html(url: str, session=None, debug: bool = False) -> str | None:
    reasons = []
    if session is not None:
        try:
            r = session.get(url, timeout=30, allow_redirects=True)
            if r.status_code == 200 and r.text and len(r.text) > _MIN_OK_LEN:
                return r.text
            # One retry: re-warm the homepage (refresh Akamai cookie) then retry.
            try:
                session.get("https://www.edmunds.com/", timeout=30)
                r2 = session.get(url, timeout=30, allow_redirects=True)
                if r2.status_code == 200 and r2.text and len(r2.text) > _MIN_OK_LEN:
                    return r2.text
                reasons.append(f"curl_cffi status={r2.status_code} len={len(r2.text or '')}")
            except Exception as e:  # noqa: BLE001
                reasons.append(f"curl_cffi retry err={e}")
        except Exception as e:  # noqa: BLE001
            reasons.append(f"curl_cffi err={e}")

    # Last-resort plain httpx (usually blocked by Akamai, kept for completeness).
    try:
        import httpx
        with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as c:
            r = c.get(url)
            if r.status_code == 200 and r.text and len(r.text) > _MIN_OK_LEN:
                return r.text
            reasons.append(f"httpx status={r.status_code} len={len(r.text or '')}")
    except Exception as e:  # noqa: BLE001
        reasons.append(f"httpx err={e}")

    if debug:
        print(f"      fetch reasons: {' | '.join(reasons)}")
    return None


# ── Parsing (static SSR markup) ───────────────────────────────────────────────
_OVERALL_RE = re.compile(r'class="rating-text[^"]*"\s*>\s*([0-9]+(?:\.[0-9]+)?)', re.I)
_SUB_RE = re.compile(
    r'<h2[^>]*>([^<]+?)</h2>\s*<div[^>]*>\s*<strong>\s*([0-9]+(?:\.[0-9]+)?)\s*</strong>',
    re.I | re.S,
)
_SELECT_RE = re.compile(r'data-tracking-id="trim_select".*?</select>', re.I | re.S)
# Some models (e.g. Model Y, E-Transit, ID. Buzz) have a body/type select before
# the trim select (SUV/Standard, Cargo/Passenger, etc.).
_TYPE_SELECT_RE = re.compile(r'(?:data-tracking-id="type_select"|name="select-type")[^>]*>.*?</select>', re.I | re.S)
_OPTION_RE = re.compile(r'<option[^>]*>(.*?)</option>', re.I | re.S)


def _num(text):
    if text is None:
        return None
    m = re.search(r"\d+(?:\.\d+)?", str(text).replace(",", ""))
    return float(m.group(0)) if m else None


def _parse_trim_option(text: str) -> dict | None:
    text = _html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
    if not text:
        return None
    msrp = None
    mm = re.search(r"\$\s*([\d,]+)", text)
    if mm:
        msrp = int(mm.group(1).replace(",", ""))
    name = re.split(r"\s*[-–]\s*\$", text)[0]
    name = re.sub(r"\(.*?\)", "", name).strip()  # drop "(Editors' Pick)" / "(Most Popular)"
    return {"name": name, "msrp": msrp} if name else None


def parse_page(html_text: str) -> dict:
    overall = None
    m = _OVERALL_RE.search(html_text)
    if m:
        overall = float(m.group(1))

    subscores: dict = {}
    for label, score in _SUB_RE.findall(html_text):
        key = SUBSCORE_LABELS.get(_html.unescape(label).strip().lower())
        if key and key not in subscores:
            subscores[key] = float(score)

    trims = []
    sel = _SELECT_RE.search(html_text)
    if sel:
        seen = set()
        for opt in _OPTION_RE.findall(sel.group(0)):
            parsed = _parse_trim_option(opt)
            if parsed and parsed["name"].lower() not in seen:
                seen.add(parsed["name"].lower())
                trims.append(parsed)

    # Optional body/type options (kept for context; not all models have them).
    types = []
    tsel = _TYPE_SELECT_RE.search(html_text)
    if tsel:
        for opt in _OPTION_RE.findall(tsel.group(0)):
            name = _html.unescape(re.sub(r"<[^>]+>", "", opt)).strip()
            if name and name.lower() not in {t.lower() for t in types}:
                types.append(name)

    out = {"overall": overall, "subscores": subscores, "trims": trims}
    if types:
        out["types"] = types
    return out


def scrape(only: str | None = None, debug: bool = False, delay_s: float = 1.0) -> dict:
    app_vehicles = _load_app_vehicles()
    if only:
        app_vehicles = [v for v in app_vehicles if v["id"] == only]
    if debug:
        print(f"Scraping Edmunds for {len(app_vehicles)} vehicles ...")

    session = make_session(debug=debug)

    out: dict = {}
    for v in app_vehicles:
        url = f"{BASE}/{_edmunds_path(v)}/"
        html_text = _fetch_html(url, session=session, debug=debug)
        if not html_text:
            if debug:
                print(f"  {v['id']}: fetch failed ({url})")
            continue
        rec = parse_page(html_text)
        if rec["overall"] is None and not rec["subscores"] and not rec["trims"]:
            if debug:
                print(f"  {v['id']}: no rating/trims parsed ({url})")
            continue
        rec["edmundsUrl"] = url
        out[v["id"]] = rec
        if debug:
            print(f"  {v['id']}: overall={rec['overall']} "
                  f"subs={len(rec['subscores'])} trims={len(rec['trims'])}")
        time.sleep(delay_s)  # be polite

    return {
        "source": "edmunds.com",
        "scrapedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "matchedCount": len(out),
        "vehicles": out,
    }


def write(payload: dict, out_path: Path = OUT_PATH) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape Edmunds expert ratings + trims (SSR HTML).")
    ap.add_argument("--only", help="Only this app vehicle id (e.g. tesla-modely-2025)")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    payload = scrape(only=args.only, debug=args.debug)
    write(payload, out_path=Path(args.out))
    print(f"Wrote {args.out}  ({payload['matchedCount']} vehicles)")


if __name__ == "__main__":
    main()
