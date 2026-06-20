"""
edmunds_incentives.py — Per-vehicle incentive scraper from Edmunds deals pages.

URL pattern: https://www.edmunds.com/{make}/{model}/{year}/deals/

What this produces:
  frontend/public/data/incentives_by_vehicle.json
    {
      "lastUpdated": "...",
      "source": "edmunds",
      "vehicles": {
        "chevrolet-equinox-ev-2025": {
          "cashRebate": 2000,
          "leaseMonthly": 299,
          "leaseDownPayment": 2999,
          "leaseTerm": 36,
          "leaseMileagePerYear": 10000,
          "financeApr": 4.9,
          "financeTerm": 60,
          "loyaltyBonus": 500,
          "totalIncentiveValue": 2000,
          "deals": [...],
          "edmundsUrl": "https://www.edmunds.com/...",
          "scrapedAt": "..."
        }
      }
    }

Side effect (optional): patches vehicles_summary.json with fresh leaseFrom / financeFrom
values from Edmunds so the matcher uses real offers instead of estimates.

CLI:
    python edmunds_incentives.py                  # all curated vehicles
    python edmunds_incentives.py --vehicle chevrolet-equinox-ev-2025
    python edmunds_incentives.py --patch-summary  # also update vehicles_summary.json
    python edmunds_incentives.py --dry-run

Programmatic:
    from incentives.edmunds_incentives import run_edmunds_pull
    report = run_edmunds_pull(dry_run=False, patch_summary=True)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Optional heavy deps (system Python has them; venv may not) ───────────────
try:
    from curl_cffi import requests as cffi_requests
    _CFFI_OK = True
except ImportError:
    _CFFI_OK = False

try:
    from bs4 import BeautifulSoup
    _BS4_OK = True
except ImportError:
    _BS4_OK = False

try:
    from playwright.sync_api import sync_playwright
    from playwright_stealth import Stealth as _PWS
    _PW_OK = True
except ImportError:
    _PW_OK = False

if not _CFFI_OK:
    raise ImportError(
        "edmunds_incentives requires curl_cffi for Chrome TLS impersonation. "
        "Run: pip install curl_cffi"
    )

# ── Paths ────────────────────────────────────────────────────────────────────
SCRAPER_DIR  = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR     = PROJECT_ROOT / "frontend" / "public" / "data"
VEHICLES_DIR = DATA_DIR / "vehicles"
SUMMARY_IN   = DATA_DIR / "vehicles_summary.json"
VEHICLE_PATH = DATA_DIR / "incentives_by_vehicle.json"

EDMUNDS_BASE = "https://www.edmunds.com"

# ── Demo localization ─────────────────────────────────────────────────────────
# This build models a single market: New York City, ZIP 10005. Edmunds deals
# pages are localized by ZIP (lease/APR/cash vary by region), so we pin every
# request to this ZIP and stamp the output with it. Override with --zip / the
# EDMUNDS_ZIP env var if you ever expand beyond the NY demo.
DEFAULT_ZIP    = os.environ.get("EDMUNDS_ZIP", "10005")
DEFAULT_REGION = os.environ.get("EDMUNDS_REGION", "NY")

# Per-trim network fetching walks the trim dropdown and fetches one page PER
# trim — which multiplies requests and reliably trips Edmunds' bot wall (403s).
# It's OFF by default; the reliable way to get true per-trim data is the offline
# parser (parse_local_deals.py) over saved HTML. Enable with --per-trim-fetch.
PER_TRIM_FETCH = False

# ── Chrome impersonation target ───────────────────────────────────────────────
# chrome131 is the most recent fingerprint curl_cffi ships and the most
# effective at bypassing Cloudflare's JA3/JA4 TLS fingerprint checks.
_IMPERSONATE = "chrome131"

# ── Browser fingerprint headers ──────────────────────────────────────────────
# Must match the Chrome version declared in the impersonate string.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,"
        "application/signed-exchange;v=b3;q=0.7"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Priority": "u=0, i",
}

# Headers for navigation from within Edmunds (used for deal page requests)
_NAV_HEADERS = {    
    **_BROWSER_HEADERS,
    "Sec-Fetch-Site": "same-origin",
    "Referer": "https://www.edmunds.com/",
}

# ── Edmunds slug overrides ───────────────────────────────────────────────────
# Maps our vehicle-id-without-year → (edmunds_make_slug, edmunds_model_slug).
# Only needed when auto-derivation from make+model yields the wrong slug.
# The auto-derivation handles 90%+ of cases correctly.
_SLUG_OVERRIDES: dict[str, tuple[str, str]] = {
    # Polestar names its models "Polestar 2" etc — Edmunds keeps that
    "polestar-polestar-2": ("polestar", "polestar-2"),
    "polestar-polestar-3": ("polestar", "polestar-3"),
    "polestar-polestar-4": ("polestar", "polestar-4"),
}

log = logging.getLogger("edmunds_incentives")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
    log.addHandler(h)
    log.setLevel(logging.INFO)


# ── URL construction ─────────────────────────────────────────────────────────

def _model_to_slug(model: str) -> str:
    """
    Convert a model display name to an Edmunds URL slug.
    E.g. "IONIQ 5" → "ioniq-5", "F-150 Lightning" → "f-150-lightning",
         "ID.4" → "id-4", "ID. Buzz" → "id-buzz", "Model 3" → "model-3"
    """
    s = model.lower()
    # Replace periods with spaces so "ID.4" → "id 4" not "id4"
    s = s.replace(".", " ")
    # Replace any non-alphanumeric run with a single hyphen
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _make_to_slug(make: str) -> str:
    """Convert a make display name to an Edmunds make slug."""
    m = make.lower().strip()
    # Edmunds uses "mercedes-benz" not "mercedes"
    if m in ("mercedes", "mercedes benz"):
        return "mercedes-benz"
    return re.sub(r"[^a-z0-9]+", "-", m).strip("-")


def edmunds_url(vehicle: dict, year_override: Optional[int] = None,
                zip_code: Optional[str] = None) -> str:
    """
    Build the Edmunds deals page URL for a vehicle, localized to a ZIP.
    year_override lets the caller try a different model year than the one in
    vehicles_summary.json (e.g. try 2026 before falling back to 2025).
    zip_code localizes the deals (lease/APR/cash vary by region); defaults to
    the NY demo ZIP.
    """
    vid = vehicle.get("id", "")
    year = str(year_override or vehicle.get("year", ""))
    base_year = str(vehicle.get("year", ""))
    zc = zip_code or DEFAULT_ZIP

    # Strip trailing base year to get the id-without-year key for overrides
    vid_no_year = vid[: -(len(base_year) + 1)] if vid.endswith(f"-{base_year}") else vid

    if vid_no_year in _SLUG_OVERRIDES:
        make_slug, model_slug = _SLUG_OVERRIDES[vid_no_year]
    else:
        make_slug  = _make_to_slug(vehicle.get("make", ""))
        model_slug = _model_to_slug(vehicle.get("model", ""))

    # ?zipcode= localizes the deals page to the NY market (ZIP 10005).
    return f"{EDMUNDS_BASE}/{make_slug}/{model_slug}/{year}/deals/?zipcode={zc}"


# ── Persistent curl_cffi session ─────────────────────────────────────────────
# Cloudflare sets cf_clearance cookies on the first request; stateless one-off
# calls never receive those cookies, so every request is blocked with 403.
# Using a Session preserves cookies and HTTP/2 connection state across requests,
# making the traffic pattern indistinguishable from a real Chrome session.

_SESSION: Optional["cffi_requests.Session"] = None

# Persistent Playwright browser state (Firefox — lower CF detection risk than Chromium)
_PW_PLAYWRIGHT = None   # sync_playwright().__enter__() result
_PW_BROWSER    = None   # Browser instance
_PW_CONTEXT    = None   # BrowserContext with warm cookies


def _get_pw_page():
    """
    Return a (page, context) pair from the persistent Playwright Firefox session.
    Creates and warms up the session on first call.
    On error, tears down the session so the next call retries from scratch.
    """
    global _PW_PLAYWRIGHT, _PW_BROWSER, _PW_CONTEXT

    if _PW_CONTEXT is not None:
        try:
            page = _PW_CONTEXT.new_page()
            return page, _PW_CONTEXT
        except Exception:
            _reset_pw_session()

    # First call or reset — create everything fresh
    log.info("  [PW/firefox] launching persistent Firefox session...")
    if _PW_PLAYWRIGHT is None:
        _PW_PLAYWRIGHT = sync_playwright().start()

    _PW_BROWSER = _PW_PLAYWRIGHT.firefox.launch(headless=True)
    _PW_CONTEXT = _PW_BROWSER.new_context(
        viewport={"width": 1280, "height": 800},
        locale="en-US",
        timezone_id="America/New_York",
        extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
    )

    # Warm-up: visit homepage so Cloudflare can set session cookies
    page = _PW_CONTEXT.new_page()
    log.info("  [PW/firefox] warming up on homepage...")
    try:
        page.goto("https://www.edmunds.com/", wait_until="domcontentloaded", timeout=30_000)
        time.sleep(2.5)
        page.close()
    except Exception as e:
        log.warning(f"  [PW/firefox] warm-up error: {e}")
        page.close()

    return _PW_CONTEXT.new_page(), _PW_CONTEXT


def _reset_pw_session() -> None:
    """Tear down the Playwright Firefox session so next call creates a fresh one."""
    global _PW_BROWSER, _PW_CONTEXT
    try:
        if _PW_BROWSER:
            _PW_BROWSER.close()
    except Exception:
        pass
    _PW_BROWSER = None
    _PW_CONTEXT = None


def _fetch_with_playwright(url: str) -> "str | _Blocked | None":
    """
    Fetch a page using the persistent Firefox Playwright session.
    If Firefox is blocked (403), tries Chromium with stealth as a last resort.

    Returns:
        str        — HTML on success
        _Blocked   — server said no (propagates 404 so caller can year-fallback)
        None       — connection / browser error
    """
    if not _PW_OK:
        log.warning("playwright not installed — cannot use browser fallback")
        return None

    # ── Firefox (persistent session) ──────────────────────────────────────────
    try:
        page, _ctx = _get_pw_page()
        log.info(f"  [PW/firefox] navigating to deals page...")
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        time.sleep(1.5)
        status = resp.status if resp else None
        log.info(f"  [PW/firefox] HTTP {status}")
        if status == 200:
            html = page.content()
            page.close()
            return html
        page.close()
        if status == 404:
            return _Blocked(404)   # propagate so year-fallback works
        if status == 403:
            log.info("  [PW/firefox] blocked — resetting session, trying Chromium")
            _reset_pw_session()
    except Exception as e:
        log.error(f"  [PW/firefox] error: {e}")
        _reset_pw_session()

    # ── Chromium with stealth (reuse existing PW instance) ────────────────────
    # We must reuse _PW_PLAYWRIGHT if it exists; starting a second sync_playwright()
    # inside an already-running event loop causes a conflict.
    log.info("  [PW/chromium] trying stealth Chromium as last resort...")
    pw_inst = _PW_PLAYWRIGHT
    owned_pw = False
    try:
        if pw_inst is None:
            pw_inst = sync_playwright().start()
            owned_pw = True
        browser = pw_inst.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled",
                  "--disable-dev-shm-usage", "--window-size=1280,800"],
        )
        ctx = browser.new_context(
            user_agent=_BROWSER_HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = ctx.new_page()
        _PWS().apply_stealth_sync(page)
        page.goto("https://www.edmunds.com/", wait_until="domcontentloaded", timeout=30_000)
        time.sleep(2.5)
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        time.sleep(1.5)
        status = resp.status if resp else None
        log.info(f"  [PW/chromium] HTTP {status}")
        if status == 200:
            html = page.content()
            browser.close()
            if owned_pw:
                pw_inst.stop()
            return html
        browser.close()
        if owned_pw:
            pw_inst.stop()
        if status == 404:
            return _Blocked(404)
    except Exception as e:
        log.error(f"  [PW/chromium] error: {e}")

    log.warning("  [PW] all browser strategies exhausted for this vehicle")
    return None


def _get_session() -> "cffi_requests.Session":
    """
    Return the shared curl_cffi Session, creating and warming it up on first call.

    Strategy:
      1. Create a curl_cffi Session and hit the Edmunds homepage.
      2. If Cloudflare lets us through (200) → also visit the EV overview page
         to build organic-looking history, then proceed.
      3. If the homepage returns 403 (IP flagged) → use Playwright to solve the
         JS challenge and harvest a real cf_clearance cookie, then inject it into
         the curl_cffi session so subsequent requests bypass the wall.
    """
    global _SESSION
    if _SESSION is not None:
        return _SESSION

    session = cffi_requests.Session()
    # Pin the session to the NY demo ZIP so deals localize consistently.
    for ck in ("pref_zipcode", "zipcode", "edm_zip"):
        try:
            session.cookies.set(ck, DEFAULT_ZIP, domain=".edmunds.com")
        except Exception:
            pass
    log.info(f"Initialising Edmunds session (ZIP {DEFAULT_ZIP}, multi-page warm-up)...")
    try:
        # Step 1 — homepage (Cloudflare sets cf_clearance here)
        r1 = session.get(
            "https://www.edmunds.com/",
            headers=_BROWSER_HEADERS,
            impersonate=_IMPERSONATE,
            timeout=25,
            allow_redirects=True,
        )
        log.info(f"  [warm-up] homepage: HTTP {r1.status_code} "
                 f"(cookies: {len(session.cookies)})")

        if r1.status_code == 403:
            # curl_cffi TLS blocked — note this; _fetch() will route blocked
            # URLs through Playwright directly (it fetches the full page).
            log.info("  [warm-up] curl_cffi blocked — Playwright fallback active for deal pages")
            _SESSION = session
            return session

        time.sleep(1.8)

        # Step 2 — navigate to EV overview (looks organic)
        r2 = session.get(
            "https://www.edmunds.com/electric-car/",
            headers={**_NAV_HEADERS, "Referer": "https://www.edmunds.com/"},
            impersonate=_IMPERSONATE,
            timeout=25,
            allow_redirects=True,
        )
        log.info(f"  [warm-up] EV overview: HTTP {r2.status_code}")
        time.sleep(1.5)
    except Exception as e:
        log.warning(f"  Session warm-up failed ({e}) — will try deal pages anyway")

    _SESSION = session
    return session


def _reset_session() -> None:
    """
    Discard the current session so the next _get_session() call creates a
    fresh one with a new Cloudflare challenge / cookie set.
    """
    global _SESSION
    _SESSION = None




# Sentinel returned by _fetch to distinguish "server said no" from "connection error"
class _Blocked:
    """Returned when the server responded but refused the request (4xx)."""
    def __init__(self, status: int):
        self.status = status


def _fetch(url: str, timeout: int = 25, _depth: int = 0) -> "str | _Blocked | None":
    """
    Fetch an Edmunds page.

    Primary path: curl_cffi with Chrome TLS impersonation (fast, low overhead).
    Fallback path: Playwright full-browser (slow but handles Cloudflare JS challenges).

    On the first 403 from curl_cffi:
      1. Try Playwright to fetch the page directly (real Chrome → no CF block).
      2. If Playwright also fails, give up on this vehicle (_Blocked).

    Returns:
        str       — HTML on success
        _Blocked  — server refused after all fallbacks (403 or 404)
        None      — connection / network error
    """
    session = _get_session()
    try:
        r = session.get(
            url,
            headers=_NAV_HEADERS,
            impersonate=_IMPERSONATE,
            timeout=timeout,
            allow_redirects=True,
        )
        if r.status_code == 200:
            return r.text

        if r.status_code == 403 and _depth == 0:
            log.info("  curl_cffi 403 — trying Playwright fallback...")
            pw_result = _fetch_with_playwright(url)
            if isinstance(pw_result, str):
                return pw_result         # HTML success
            if isinstance(pw_result, _Blocked):
                return pw_result         # propagate 404 / other HTTP errors
            return _Blocked(403)         # Playwright returned None → give up

        log.debug(f"HTTP {r.status_code} for {url}")
        return _Blocked(r.status_code)
    except Exception as e:
        log.error(f"Request error for {url}: {e}")
        return None


# ── Parse helpers ─────────────────────────────────────────────────────────────

def _extract_next_data(html: str) -> Optional[dict]:
    """
    Pull the Next.js hydration payload from a page.
    Edmunds (Next.js) embeds all SSR props in:
        <script id="__NEXT_DATA__" type="application/json">…</script>
    """
    m = re.search(
        r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>\s*(\{.*?\})\s*</script>',
        html, re.DOTALL
    )
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def _find_deals_in_json(obj, depth: int = 0, max_depth: int = 20) -> list[dict]:
    """
    Recursively walk a parsed JSON object looking for deal/incentive structures.
    Returns a flat list of raw deal dicts.
    Stops at max_depth to prevent runaway recursion on huge blobs.
    """
    if depth > max_depth or not obj:
        return []

    results = []

    if isinstance(obj, list):
        for item in obj:
            results.extend(_find_deals_in_json(item, depth + 1, max_depth))
        return results

    if isinstance(obj, dict):
        # Looks like a deal object if it has type + amount / monthlyPayment / apr
        keys = {k.lower() for k in obj}
        is_deal = (
            ("type" in keys or "dealtype" in keys or "incentivetype" in keys)
            and (
                "amount" in keys
                or "monthlypayment" in keys
                or "apr" in keys
                or "cashback" in keys
                or "rebate" in keys
                or "value" in keys
            )
        )
        if is_deal:
            results.append(obj)
        # Recurse into all values regardless
        for v in obj.values():
            if isinstance(v, (dict, list)):
                results.extend(_find_deals_in_json(v, depth + 1, max_depth))

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Typed deal extraction from JSON
# ─────────────────────────────────────────────────────────────────────────────

def _safe_int(val) -> Optional[int]:
    try:
        return int(float(str(val).replace(",", "")))
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> Optional[float]:
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return None


def _normalize_deal(raw: dict) -> Optional[dict]:
    """
    Normalize a raw Edmunds deal object into a canonical shape:
      { type, amount, monthlyPayment, downPayment, termMonths, mileagePerYear, apr,
        description, expires, raw }
    Returns None if the object carries no useful numeric data.
    """
    # Determine deal type from any of several possible key names
    deal_type = (
        raw.get("type") or raw.get("dealType") or raw.get("incentiveType")
        or raw.get("offerType") or ""
    ).upper()

    amount    = _safe_int(raw.get("amount") or raw.get("cashBack") or raw.get("rebate") or raw.get("value") or 0)
    monthly   = _safe_int(raw.get("monthlyPayment") or raw.get("payment") or raw.get("leasePayment"))
    down      = _safe_int(raw.get("downPayment") or raw.get("dueAtSigning") or raw.get("down"))
    term      = _safe_int(raw.get("termMonths") or raw.get("term") or raw.get("months"))
    mileage   = _safe_int(raw.get("annualMileage") or raw.get("mileagePerYear") or raw.get("miles"))
    apr       = _safe_float(raw.get("apr") or raw.get("interestRate") or raw.get("rate"))
    desc      = str(raw.get("description") or raw.get("title") or raw.get("name") or "")
    expires   = str(raw.get("expirationDate") or raw.get("expiration") or raw.get("endDate") or "")

    # If nothing meaningful, skip
    if not any([amount, monthly, apr]):
        return None

    return {
        "type":           deal_type or "UNKNOWN",
        "amount":         amount,
        "monthlyPayment": monthly,
        "downPayment":    down,
        "termMonths":     term,
        "mileagePerYear": mileage,
        "apr":            apr,
        "description":    desc[:200],
        "expires":        expires[:30],
    }


# ─────────────────────────────────────────────────────────────────────────────
# HTML / text fallback parsers
# ─────────────────────────────────────────────────────────────────────────────
#
# Edmunds deal pages render text like:
#
#   Cash (7 available)
#   Show details
#       $4,000 Select Inventory Offer - Expires 06/02/2026
#       $1,250 Conquest Offer - Expires 06/02/2026
#       $500 Military Offer - Expires 06/02/2026
#   Lease (1 available)
#   Show details
#       $299 /mo for 36 months, $3,499 due at signing
#   Financing (2 available)
#   Show details
#       $4,000 Alternative APR - Expires 06/02/2026
#       0% APR for 36 months - Expires 06/02/2026
#   Other (3 available)
#       $2,000 State Rebate - Expires 01/01/2027
#
# We parse each named section independently so amounts are categorised
# correctly (a $4,000 figure in the Cash section is a rebate; the same
# figure in Financing means "in lieu of APR").
# ─────────────────────────────────────────────────────────────────────────────

# Section header: "Cash (N available)"
_SEC = re.compile(
    r'(Cash|Lease|Financing|Other)\s*\(\d+\s+available\)(.*?)(?=(?:Cash|Lease|Financing|Other)\s*\(\d+\s+available\)|$)',
    re.DOTALL | re.IGNORECASE,
)
# Deal line: optional "$AMOUNT" followed by description text
_DEAL_AMOUNT = re.compile(r'\$\s*([\d,]+)')
_APR_VALUE   = re.compile(r'([\d.]+)\s*%\s*APR', re.IGNORECASE)
_SPECIAL_APR = re.compile(r'special\s+APR|0\s*%\s*APR', re.IGNORECASE)
_LEASE_MO    = re.compile(r'\$\s*([\d,]+)\s*/\s*mo(?:nth)?', re.IGNORECASE)
_LEASE_TERM  = re.compile(r'(\d+)\s*-?\s*month', re.IGNORECASE)
_LEASE_DUE   = re.compile(r'\$\s*([\d,]+)\s*due\s+at\s+signing', re.IGNORECASE)

# Exclude deal-line amounts that are clearly years or zip codes
def _plausible_cash(v: Optional[int]) -> bool:
    return v is not None and 100 <= v <= 30_000


def _page_text(html: str) -> str:
    if _BS4_OK:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "head", "meta"]):
            tag.decompose()
        return soup.get_text("\n", strip=True)
    return re.sub(r"<[^>]+>", " ", html)


def _parse_html_fallback(html: str) -> list[dict]:
    """
    Section-aware text extraction for Edmunds deal pages.
    Handles Edmunds' actual format: '$4,000 Select Inventory Offer - Expires DATE'.
    Returns a list of normalised deal dicts.
    """
    text = _page_text(html)
    deals: list[dict] = []

    for sec_m in _SEC.finditer(text):
        section  = sec_m.group(1).upper()   # "CASH", "LEASE", "FINANCING", "OTHER"
        body     = sec_m.group(2)

        if section == "CASH":
            # Every dollar amount in the Cash section is a cash rebate
            for m in _DEAL_AMOUNT.finditer(body):
                v = _safe_int(m.group(1))
                if _plausible_cash(v):
                    # Grab description text after the amount on the same line
                    line_rest = body[m.end():].split("\n")[0].strip()
                    deals.append({
                        "type": "REBATE",
                        "amount": v,
                        "description": f"${v:,} {line_rest}"[:200],
                    })

        elif section == "LEASE":
            # Look for monthly payment pattern: "$299 /mo"
            mo_m = _LEASE_MO.search(body)
            if mo_m:
                monthly = _safe_int(mo_m.group(1))
                if monthly and 50 <= monthly <= 5_000:
                    term_m = _LEASE_TERM.search(body)
                    due_m  = _LEASE_DUE.search(body)
                    deals.append({
                        "type": "LEASE",
                        "monthlyPayment": monthly,
                        "downPayment": _safe_int(due_m.group(1)) if due_m else None,
                        "termMonths": _safe_int(term_m.group(1)) if term_m else 36,
                    })
            else:
                # Lease cash offer (e.g. "$500 Lease Loyalty or Conquest Offer")
                for m in _DEAL_AMOUNT.finditer(body):
                    v = _safe_int(m.group(1))
                    if _plausible_cash(v):
                        line_rest = body[m.end():].split("\n")[0].strip()
                        deals.append({
                            "type": "LOYALTY",
                            "amount": v,
                            "description": f"${v:,} {line_rest}"[:200],
                        })

        elif section == "FINANCING":
            # Explicit "X% APR" values
            for m in _APR_VALUE.finditer(body):
                v = _safe_float(m.group(1))
                if v is not None and 0.0 <= v <= 20.0:
                    term_m = _LEASE_TERM.search(body[m.start():m.start() + 80])
                    deals.append({
                        "type": "APR",
                        "apr": v,
                        "termMonths": _safe_int(term_m.group(1)) if term_m else 60,
                        "description": m.group(0)[:80],
                    })
            # "Special APR" / "0% APR" keyword without explicit value
            if _SPECIAL_APR.search(body) and not _APR_VALUE.search(body):
                term_m = _LEASE_TERM.search(body)
                deals.append({
                    "type": "APR",
                    "apr": 0.0,
                    "termMonths": _safe_int(term_m.group(1)) if term_m else 60,
                    "description": "Special APR (Edmunds)",
                })

        elif section == "OTHER":
            # State rebates and misc — count toward totalIncentiveValue
            for m in _DEAL_AMOUNT.finditer(body):
                v = _safe_int(m.group(1))
                if _plausible_cash(v):
                    line_rest = body[m.end():].split("\n")[0].strip().lower()
                    if "state rebate" in line_rest or "state incentive" in line_rest:
                        deals.append({"type": "REBATE", "amount": v,
                                      "description": f"${v:,} State Rebate"})

    # ── Fallback when no section headers found (older Edmunds layout) ─────────
    if not deals:
        # Generic cash rebate patterns
        for pat in (
            re.compile(r'(?:cash\s*(?:back|rebate)|customer\s*cash|bonus\s*cash)[^\$]{0,80}\$\s*([\d,]+)', re.I),
        ):
            for m in pat.finditer(text):
                v = _safe_int(m.group(1))
                if _plausible_cash(v):
                    deals.append({"type": "REBATE", "amount": v,
                                  "description": m.group(0)[:120]})
        # APR offers
        for m in _APR_VALUE.finditer(text):
            v = _safe_float(m.group(1))
            if v is not None and 0 <= v <= 20:
                deals.append({"type": "APR", "apr": v,
                              "description": m.group(0)[:80]})

    return deals


# ─────────────────────────────────────────────────────────────────────────────
# Summarise raw deal list → canonical vehicle incentive record
# ─────────────────────────────────────────────────────────────────────────────

def _trim_names_for(vid: str) -> list[tuple[str, Optional[int]]]:
    """
    Read the per-vehicle detail JSON and return [(trimName, msrp), ...] for the
    priced trims, so we can emit a per-trim incentive breakdown. Returns [] when
    the detail file is missing or has no named trims.
    """
    path = VEHICLES_DIR / f"{vid}.json"
    if not path.exists():
        return []
    try:
        detail = json.loads(path.read_text("utf-8"))
    except Exception:
        return []
    out: list[tuple[str, Optional[int]]] = []
    for t in detail.get("trims", []) or []:
        name = t.get("name")
        if name:
            out.append((name, t.get("msrp")))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Per-trim, per-payment-type parsing from Edmunds' __NEXT_DATA__
# ─────────────────────────────────────────────────────────────────────────────
#
# Real structure (observed on a 2026 Kia EV6 deals page):
#
#   styles: {
#     "402064975": {
#       "name": "4dr SUV", "trim": "Base",
#       "inventoryCodes": { "NEW": { "incentives": {
#           "bonus": [
#             { "type":"CUSTOMER_CASH", "subtype":"Customer Cash",
#               "rebateAmount":3000, "endDate":"06/02/2026", ... },         # regular cash → in total
#             { "type":"CUSTOMER_CASH", "subtype":"Limited Term Lease Offer",
#               "rebateAmount":7500, "endDate":"06/02/2026", ... }          # LEASE cash → popup only
#           ],
#           "apr": [
#             { "type":"CUSTOMER_APR", "subtype":"Special APR",
#               "rates":[{"apr":0,"termMonths":36},{"apr":2.49,"termMonths":84}],
#               "transactionTypes":["FINANCE"], ... }                       # finance → in total
#           ],
#           "lease": [ { "termMonths":36, "monthlyPayment":429, "dueAtSigning":3999 } ],  # 24/36 only
#           "other": [ ... ]
#       } } }
#     }, ...
#   }
#
# A "lease cash" bonus (subtype contains "lease") is shown to the user in a popup
# but is NOT applied to the all-in total. Regular cash + finance APR/cash ARE.

_LEASE_TERMS_KEPT = (24, 36)


def _is_lease_cash(sub: str, name: str = "") -> bool:
    s = f"{sub} {name}".lower()
    return "lease" in s


# Targeted / conditional offers — require qualifying or are a separate state
# rebate, so they must NOT be summed into the broadly-available cash rebate.
_CONDITIONAL_CASH = re.compile(
    r"military|first[\s-]*responder|college|grad|student|conquest|loyal|competit|"
    r"lender|financ|apr|costco|affinity|mobility|charger|recent|returning|"
    r"state\s*rebate|trade|down\s*payment|disab|uber|rideshare", re.I)


def _is_broad_cash(name: str) -> bool:
    """True if this cash offer is broadly available (everyone gets it)."""
    return not _CONDITIONAL_CASH.search(name or "")


def _style_name(style: dict) -> Optional[str]:
    """Friendly trim label for a style object, e.g. 'SE Standard Range 4dr SUV'."""
    name = (style.get("name") or "").strip()
    trim = (style.get("trim") or "").strip()
    if name and trim and trim.lower() not in ("base", "") and trim.lower() not in name.lower():
        return f"{trim} {name}".strip()
    return name or None


def _collect_styles_with_incentives(obj, found: list, _depth: int = 0) -> None:
    """
    Walk the (normalized) __NEXT_DATA__ tree and collect (styleId, styleObj,
    incentives) wherever a style carries inventoryCodes.NEW.incentives.
    Also collects a styleId→styleObj catalog so names can be resolved.
    """
    if _depth > 30 or obj is None:
        return
    if isinstance(obj, list):
        for it in obj:
            _collect_styles_with_incentives(it, found, _depth + 1)
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and k.isdigit() and isinstance(v, dict):
                inc = (((v.get("inventoryCodes") or {}).get("NEW") or {}).get("incentives"))
                if isinstance(inc, dict) and any(
                    isinstance(inc.get(c), list) for c in ("bonus", "apr", "lease", "other")
                ):
                    found.append((k, v, inc))
            _collect_styles_with_incentives(v, found, _depth + 1)


def _build_style_name_map(next_data: dict) -> dict:
    """styleId → friendly name, from any styles catalog in the tree."""
    names: dict = {}

    def walk(o, d=0):
        if d > 30 or o is None:
            return
        if isinstance(o, list):
            for it in o:
                walk(it, d + 1)
        elif isinstance(o, dict):
            for k, v in o.items():
                if isinstance(k, str) and k.isdigit() and isinstance(v, dict) and v.get("name"):
                    nm = _style_name(v)
                    if nm and k not in names:
                        names[k] = nm
                walk(v, d + 1)

    walk(next_data)
    return names


def _categorise_incentives(inc: dict) -> dict:
    """
    Turn one style's `incentives` block into the per-trim, per-payment-type shape.

      cash    → regular customer/bonus cash (applied to total)
      finance → best (lowest) APR + its term, plus finance-eligible cash
      lease   → 24/36-month monthly offers + lease cash (popup, NOT in total)
      other   → everything else (info/popup)
    """
    cash_items, lease_cash_items, finance_items, other_items = [], [], [], []
    cash_total = 0
    lease_cash_total = 0
    lease_terms: dict = {}

    for b in inc.get("bonus") or []:
        amt = _safe_int(b.get("rebateAmount")) or 0
        sub = b.get("subtype") or ""
        nm  = b.get("name") or sub
        item = {"label": nm, "amount": amt, "expires": (b.get("endDate") or "")[:10]}
        if _is_lease_cash(sub, nm):
            lease_cash_total = max(lease_cash_total, amt)   # lease cash doesn't stack
            lease_cash_items.append(item)
        else:
            # Only broadly-available cash counts toward the applied rebate;
            # targeted offers (military, grad, conquest, lender, state, charger…)
            # don't stack for a typical buyer and are kept in items for display.
            if _is_broad_cash(nm):
                cash_total += amt
            cash_items.append(item)

    best_apr, best_term = None, None
    for a in inc.get("apr") or []:
        rates = a.get("rates") or []
        for r in rates:
            ap = _safe_float(r.get("apr"))
            tm = _safe_int(r.get("termMonths"))
            if ap is not None and (best_apr is None or ap < best_apr):
                best_apr, best_term = ap, tm
        finance_items.append({
            "label": a.get("name") or a.get("subtype") or "APR",
            "rates": [{"apr": _safe_float(r.get("apr")), "termMonths": _safe_int(r.get("termMonths"))}
                      for r in rates],
            "rebate": _safe_int(a.get("rebateAmount")) or 0,
            "expires": (a.get("endDate") or "")[:10],
        })

    for l in inc.get("lease") or []:
        tm = _safe_int(l.get("termMonths"))
        mp = _safe_int(l.get("monthlyPayment"))
        if tm in _LEASE_TERMS_KEPT and mp:
            lease_terms[str(tm)] = {
                "monthlyPayment": mp,
                "dueAtSigning": _safe_int(l.get("dueAtSigning")),
                "milesPerYear": _safe_int(l.get("annualMileage")) or 10000,
            }

    for o in inc.get("other") or []:
        other_items.append({
            "label": o.get("name") or o.get("subtype") or "Other",
            "amount": _safe_int(o.get("rebateAmount")) or 0,
            "expires": (o.get("endDate") or "")[:10],
        })

    entry: dict = {
        "cash":    {"rebate": cash_total, "items": cash_items},
        "finance": {"apr": best_apr, "termMonths": best_term or 60,
                    "rebate": cash_total, "items": finance_items},
        "lease":   {"terms": lease_terms, "leaseCash": lease_cash_total,
                    "items": lease_cash_items},
        "other":   other_items,
    }
    return entry


def _extract_incentives_v2(next_data: dict) -> dict:
    """
    Parse Edmunds' __NEXT_DATA__ into per-trim offers + a model-level aggregate.
    Returns { "trims": {trimName: entry}, "model": entry } or {} if nothing found.
    """
    if not isinstance(next_data, dict):
        return {}
    found: list = []
    _collect_styles_with_incentives(next_data, found)
    if not found:
        return {}
    name_map = _build_style_name_map(next_data)

    trims: dict = {}
    for sid, style, inc in found:
        label = _style_name(style) or name_map.get(sid) or f"Style {sid}"
        entry = _categorise_incentives(inc)
        # Skip empty entries (no cash/apr/lease/other)
        if (entry["cash"]["rebate"] or entry["finance"]["apr"] is not None
                or entry["lease"]["terms"] or entry["lease"]["leaseCash"] or entry["other"]):
            trims[label] = entry

    if not trims:
        return {}

    # Model-level aggregate = the "best" across trims (max cash, min APR, etc.)
    model = {
        "cash":    {"rebate": 0, "items": []},
        "finance": {"apr": None, "termMonths": 60, "rebate": 0, "items": []},
        "lease":   {"terms": {}, "leaseCash": 0, "items": []},
        "other":   [],
    }
    for e in trims.values():
        model["cash"]["rebate"] = max(model["cash"]["rebate"], e["cash"]["rebate"])
        if e["finance"]["apr"] is not None and (
                model["finance"]["apr"] is None or e["finance"]["apr"] < model["finance"]["apr"]):
            model["finance"]["apr"] = e["finance"]["apr"]
            model["finance"]["termMonths"] = e["finance"]["termMonths"]
        model["finance"]["rebate"] = max(model["finance"]["rebate"], e["finance"]["rebate"])
        model["lease"]["leaseCash"] = max(model["lease"]["leaseCash"], e["lease"]["leaseCash"])
        for t, v in e["lease"]["terms"].items():
            cur = model["lease"]["terms"].get(t)
            if not cur or (v.get("monthlyPayment") or 1e9) < (cur.get("monthlyPayment") or 1e9):
                model["lease"]["terms"][t] = v
    return {"trims": trims, "model": model}


# ─────────────────────────────────────────────────────────────────────────────
# Raw-HTML typed-incentive extraction (Edmunds is NOT Next.js — the SSR state
# lives in a plain inline <script>, so __NEXT_DATA__ parsing won't fire). We scan
# the raw HTML for the typed incentive objects directly. The structure is stable:
#   "type":"CUSTOMER_CASH","subtype":"Customer Cash", ... "rebateAmount":3000,
#       "endDate":"06/02/2026", ... "styles":[{"$ref":"#/styles/402064975"}]
#   "type":"CUSTOMER_APR","subtype":"Special APR", ... "rates":[{"apr":0,"termMonths":36}]
# ─────────────────────────────────────────────────────────────────────────────

_RE_INCENTIVE = re.compile(r'"type":"([A-Z_]+)","subtype":"([^"]*)"')
_RE_REBATE    = re.compile(r'"rebateAmount":(\d+)')
_RE_ENDDATE   = re.compile(r'"endDate":"([^"]+)"')
_RE_RATE      = re.compile(r'"apr":([\d.]+),"termMonths":(\d+)')
_RE_STYLEREF  = re.compile(r'#/styles/(\d+)')
_RE_LEASE_OBJ = re.compile(r'"monthlyPayment":(\d+)[^}]*?"termMonths":(\d+)|"termMonths":(\d+)[^}]*?"monthlyPayment":(\d+)')
# Trim dropdown: <option value="402064975" ...>SE Standard Range 4dr SUV</option>
_RE_OPTION    = re.compile(r'<option[^>]*\bvalue="(\d+)"[^>]*>([^<]+)</option>')
# Style catalog: "402064975":{"id":402064975,"name":"4dr SUV",...  (name only —
# kept simple to avoid catastrophic backtracking on the minified state blob; the
# <option> dropdown above is the primary, richer source of trim names.)
_RE_STYLECAT  = re.compile(r'"(\d{6,})":\{"id":\d+,"name":"([^"]+)"')


def _clean_trim_label(text: str) -> str:
    """
    Tidy a dropdown option label into a trim name. Edmunds labels look like:
      'SE Standard Range 4dr SUV (electric DD) - $35,000'
      'SEL 4dr SUV (electric DD) - $39,800 (Most Popular)'
      '4dr SUV - N/A (Most Popular)'
    → 'SE Standard Range 4dr SUV' / 'SEL 4dr SUV' / '4dr SUV'.
    """
    t = text or ""
    t = re.sub(r'\([^)]*\)', ' ', t)              # drop all parentheticals
    t = re.sub(r'\s*-\s*\$[\d,]+.*$', '', t)       # drop ' - $35,000…'
    t = re.sub(r'\s*-\s*N/?A.*$', '', t, flags=re.I)  # drop ' - N/A…'
    t = re.sub(r'\s+', ' ', t).strip(' -')
    return t


def _raw_style_names(html: str) -> dict:
    """styleId → trim label, from the trim <select> first, then the JSON catalog."""
    names: dict = {}
    for sid, txt in _RE_OPTION.findall(html):
        lbl = _clean_trim_label(txt)
        if lbl and sid not in names:
            names[sid] = lbl
    for sid, name in _RE_STYLECAT.findall(html):
        if sid not in names and name:
            names[sid] = name.strip()
    return names


# The deals page only embeds the *selected* style's incentives; switching the
# trim dropdown reloads with ?styleid=<id>. So to get every trim we enumerate the
# <select id="style-custom-select"> options and fetch each style page.
_RE_STYLE_SELECT = re.compile(r'id="style-custom-select".*?</select>', re.DOTALL)


def _style_options(html: str) -> list:
    """[(styleId, trimLabel), ...] from the trim dropdown (in document order)."""
    if not html:
        return []
    m = _RE_STYLE_SELECT.search(html)
    block = m.group(0) if m else ""
    if not block:
        return []
    out, seen = [], set()
    for sid, txt in _RE_OPTION.findall(block):
        if sid in seen:
            continue
        seen.add(sid)
        lbl = _clean_trim_label(txt)
        if lbl:
            out.append((sid, lbl))
    return out


def _styled_url(base_url: str, style_id: str) -> str:
    """Add &styleid=<id> to a deals URL (keeps the existing ?zipcode=… query)."""
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}styleid={style_id}"


# ── Map Edmunds trim labels → the app's detail trim names ─────────────────────
_TRIM_DROP = re.compile(
    r'\b(4dr|2dr|suv|sedan|hatchback|wagon|truck|van|coupe|crew|cab|electric|dd|'
    r'w/?tow|hitch|most|popular|package|pkg|with|w/)\b', re.I)


def _trim_signature(name: str) -> set:
    """Normalized token set for fuzzy trim matching (trim level + drivetrain)."""
    s = (name or "").lower().replace("-", " ").replace("/", " ")
    s = _TRIM_DROP.sub(" ", s)
    toks = {w for w in re.split(r'\s+', s) if w and not w.isdigit()}
    # Normalize drivetrain: default to RWD when none is stated (Edmunds omits it
    # on rear-drive styles; the app spells it out).
    if "awd" in toks or "4motion" in toks or "4wd" in toks:
        toks.discard("4motion"); toks.discard("4wd"); toks.add("awd")
    elif "fwd" in toks:
        pass
    else:
        toks.add("rwd")
    return toks


def _match_app_trim(edmunds_label: str, app_trims: list) -> Optional[str]:
    """Best app trim name for an Edmunds label, by token overlap (or None)."""
    if not app_trims:
        return None
    esig = _trim_signature(edmunds_label)
    best, best_score = None, 0.0
    for name, _msrp in app_trims:
        asig = _trim_signature(name)
        if not asig or not esig:
            continue
        inter = len(esig & asig)
        union = len(esig | asig) or 1
        score = inter / union
        if score > best_score:
            best, best_score = name, score
    # Require a meaningful overlap so we don't mis-map (e.g. SE↔Limited).
    return best if best_score >= 0.5 else None


def _remap_trims_to_app(vid: str, trims: dict) -> dict:
    """
    Re-key scraped per-trim offers to the app's detail trim names where a
    confident match exists, so the frontend's exact-name lookup hits. Edmunds
    labels with no app match are kept as-is (still visible in the data).
    """
    app_trims = _trim_names_for(vid)
    if not app_trims or not trims:
        return trims
    out, used = {}, set()
    for elabel, entry in trims.items():
        app_name = _match_app_trim(elabel, app_trims)
        key = app_name if (app_name and app_name not in used) else elabel
        if app_name:
            used.add(app_name)
        out[key] = entry
    return out


def _extract_incentives_v2_raw(html: str) -> dict:
    """
    Categorize every typed incentive object found in the raw HTML, grouped by the
    styles each applies to. Returns {"trims": {...}, "model": {...}} or {}.
    """
    if not html:
        return {}
    style_names = _raw_style_names(html)
    # Per-style accumulators
    per_style: dict = {}          # sid → {"cash":int,"cashItems":[],"leaseCash":int,"leaseItems":[],
                                  #        "apr":(val,term)|None,"financeItems":[],"otherItems":[]}
    model_only: list = []         # incentives with no style refs (apply to all)

    def _blank():
        return {"cash": 0, "cashItems": [], "leaseCash": 0, "leaseItems": [],
                "apr": None, "term": None, "financeRebate": 0, "financeItems": [], "otherItems": []}

    # Bound each incentive's field window by the start of the NEXT incentive
    # object so rebateAmount / endDate / rates / styles can't bleed across.
    matches = list(_RE_INCENTIVE.finditer(html))
    seen_incentives: set = set()
    found_any = False
    for i, m in enumerate(matches):
        typ, sub = m.group(1), m.group(2)
        nxt = matches[i + 1].start() if i + 1 < len(matches) else m.start() + 1500
        win = html[m.start(): min(nxt, m.start() + 2500)]
        amt_m = _RE_REBATE.search(win)
        amt = _safe_int(amt_m.group(1)) if amt_m else 0
        end_m = _RE_ENDDATE.search(win)
        expires = _norm_date(end_m.group(1)) if end_m else ""
        sids = _RE_STYLEREF.findall(win)
        rates = [(_safe_float(a), _safe_int(t)) for a, t in _RE_RATE.findall(win)]

        is_apr = "APR" in typ or "APR" in sub.upper()
        is_lease_cash = _is_lease_cash(sub)
        is_cash = (("CASH" in typ) and not is_apr and not is_lease_cash)
        is_other = (typ == "OTHER")

        if not (is_apr or is_lease_cash or is_cash or is_other or amt or rates):
            continue
        found_any = True

        targets = sids or ["__model__"]
        for sid in targets:
            acc = per_style.setdefault(sid, _blank())
            # Edmunds repeats the same incentive object across style blocks;
            # dedupe by (style, type, subtype, amount) so cash isn't summed twice.
            dedupe_key = (sid, typ, sub, amt, tuple(sorted({(a, t) for a, t in rates})))
            if dedupe_key in seen_incentives:
                continue
            seen_incentives.add(dedupe_key)
            if is_lease_cash:
                acc["leaseCash"] = max(acc["leaseCash"], amt)
                acc["leaseItems"].append({"label": sub or "Lease Offer", "amount": amt, "expires": expires})
            elif is_apr:
                for ap, tm in rates:
                    if ap is not None and (acc["apr"] is None or ap < acc["apr"]):
                        acc["apr"], acc["term"] = ap, tm
                if amt:  # "Alternative APR" cash-in-lieu
                    acc["financeRebate"] = max(acc["financeRebate"], amt)
                acc["financeItems"].append({"label": sub or "APR",
                                            "rates": [{"apr": a, "termMonths": t} for a, t in rates],
                                            "rebate": amt, "expires": expires})
            elif is_other:
                acc["otherItems"].append({"label": sub or "Other", "amount": amt, "expires": expires})
            else:  # regular cash
                acc["cash"] += amt
                acc["cashItems"].append({"label": sub or "Customer Cash", "amount": amt, "expires": expires})

    if not found_any:
        return {}

    # Lease monthly payment offers (term-keyed). These are rarely embedded, but
    # capture them when present and keep only 24 & 36-month terms.
    lease_terms_global: dict = {}
    for mm in _RE_LEASE_OBJ.finditer(html):
        mp = _safe_int(mm.group(1) or mm.group(4))
        tm = _safe_int(mm.group(2) or mm.group(3))
        if tm in _LEASE_TERMS_KEPT and mp and 100 <= mp <= 3000:
            cur = lease_terms_global.get(str(tm))
            if not cur or mp < cur["monthlyPayment"]:
                lease_terms_global[str(tm)] = {"monthlyPayment": mp, "dueAtSigning": None, "milesPerYear": 10000}

    model_acc = per_style.pop("__model__", _blank())

    def _to_entry(acc: dict) -> dict:
        # Merge the model-wide incentives into each style's own.
        cash = acc["cash"] + model_acc["cash"]
        cash_items = acc["cashItems"] + model_acc["cashItems"]
        lease_cash = max(acc["leaseCash"], model_acc["leaseCash"])
        lease_items = acc["leaseItems"] or model_acc["leaseItems"]
        apr, term = acc["apr"], acc["term"]
        if model_acc["apr"] is not None and (apr is None or model_acc["apr"] < apr):
            apr, term = model_acc["apr"], model_acc["term"]
        fin_rebate = max(acc["financeRebate"], model_acc["financeRebate"], cash)
        fin_items = acc["financeItems"] or model_acc["financeItems"]
        other_items = acc["otherItems"] + model_acc["otherItems"]
        return {
            "cash": {"rebate": cash, "items": cash_items},
            "finance": {"apr": apr, "termMonths": term or 60, "rebate": fin_rebate, "items": fin_items},
            "lease": {"terms": dict(lease_terms_global), "leaseCash": lease_cash, "items": lease_items},
            "other": other_items,
        }

    trims: dict = {}
    for sid, acc in per_style.items():
        label = style_names.get(sid, f"Style {sid}")
        trims[label] = _to_entry(acc)

    # If no per-style refs were found, emit a single model-level entry mapped to
    # the model name so the consumer still gets the full categorized breakdown.
    if not trims:
        trims["All trims"] = _to_entry(_blank())

    # Model aggregate (best across trims).
    model = {
        "cash": {"rebate": 0, "items": []},
        "finance": {"apr": None, "termMonths": 60, "rebate": 0, "items": []},
        "lease": {"terms": dict(lease_terms_global), "leaseCash": 0, "items": []},
        "other": [],
    }
    for e in trims.values():
        model["cash"]["rebate"] = max(model["cash"]["rebate"], e["cash"]["rebate"])
        if e["finance"]["apr"] is not None and (model["finance"]["apr"] is None
                or e["finance"]["apr"] < model["finance"]["apr"]):
            model["finance"]["apr"] = e["finance"]["apr"]
            model["finance"]["termMonths"] = e["finance"]["termMonths"]
        model["finance"]["rebate"] = max(model["finance"]["rebate"], e["finance"]["rebate"])
        model["lease"]["leaseCash"] = max(model["lease"]["leaseCash"], e["lease"]["leaseCash"])
    return {"trims": trims, "model": model}


def _norm_date(s: str) -> str:
    """MM/DD/YYYY → YYYY-MM-DD (best effort); pass through ISO-ish dates."""
    s = (s or "").strip()
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return s[:10]


def _aggregate_model(trims: dict) -> dict:
    """Model-level 'best across trims' aggregate from a per-trim offers dict."""
    terms: dict = {}
    for e in trims.values():
        for t, v in (e.get("lease", {}).get("terms") or {}).items():
            cur = terms.get(t)
            if not cur or (v.get("monthlyPayment") or 1e9) < (cur.get("monthlyPayment") or 1e9):
                terms[t] = v
    model = {
        "cash": {"rebate": 0, "items": []},
        "finance": {"apr": None, "termMonths": 60, "rebate": 0, "items": []},
        "lease": {"terms": terms, "leaseCash": 0, "items": []},
        "other": [],
    }
    for e in trims.values():
        model["cash"]["rebate"] = max(model["cash"]["rebate"], e["cash"]["rebate"])
        if e["finance"]["apr"] is not None and (model["finance"]["apr"] is None
                or e["finance"]["apr"] < model["finance"]["apr"]):
            model["finance"]["apr"] = e["finance"]["apr"]
            model["finance"]["termMonths"] = e["finance"]["termMonths"]
        model["finance"]["rebate"] = max(model["finance"]["rebate"], e["finance"]["rebate"])
        model["lease"]["leaseCash"] = max(model["lease"]["leaseCash"], e["lease"]["leaseCash"])
    return model


def _build_v2_multistyle(base_url: str, default_html: str, vid: str,
                         sleep_sec: float = 1.2, max_styles: int = 14) -> dict:
    """
    Build per-trim offers across EVERY trim in the deals-page dropdown. The page
    only embeds the selected style's incentives, so we enumerate the
    <select id="style-custom-select"> options and fetch each `?styleid=<id>` page,
    merging the categorized offers. Returns {"trims":..., "model":...} or {}.
    """
    merged: dict = {}
    base = _extract_incentives_v2_raw(default_html)
    for lbl, entry in (base.get("trims") or {}).items():
        merged.setdefault(lbl, entry)

    options = _style_options(default_html)
    fetched = 0
    for sid, label in options:
        if fetched >= max_styles:
            break
        if label in merged:           # already have this trim's offers
            continue
        fetched += 1
        time.sleep(sleep_sec)
        fr = _fetch(_styled_url(base_url, sid))
        if not isinstance(fr, str):
            continue                  # skip blocked/missing styles, keep going
        sv2 = _extract_incentives_v2_raw(fr)
        got = sv2.get("trims") or {}
        if got:
            for lbl, entry in got.items():
                merged.setdefault(lbl, entry)
        else:
            # Couldn't categorize this style page — at least record the label so
            # the trim is represented (empty offer).
            merged.setdefault(label, {
                "cash": {"rebate": 0, "items": []},
                "finance": {"apr": None, "termMonths": 60, "rebate": 0, "items": []},
                "lease": {"terms": {}, "leaseCash": 0, "items": []},
                "other": [],
            })

    if not merged:
        return {}
    # Re-key to the app's trim names where we can match confidently.
    merged = _remap_trims_to_app(vid, merged)
    return {"trims": merged, "model": _aggregate_model(merged)}


def _per_trim_offers_fallback(vid: str, summary: dict) -> dict:
    """
    Fallback when __NEXT_DATA__ has no typed incentives: apply the model-level
    text-parsed summary to each priced trim (legacy behavior). The v2 shape is
    preserved so the frontend reads it uniformly.
    """
    trims = _trim_names_for(vid)
    if not trims:
        return {}
    cash = summary.get("cashRebate") or 0
    apr  = summary.get("financeApr")
    fterm = summary.get("financeTerm") or 60
    lease_mo = summary.get("leaseMonthly")
    lease_down = summary.get("leaseDownPayment")
    out: dict = {}
    for name, _msrp in trims:
        entry: dict = {
            "cash":    {"rebate": cash, "items": []},
            "finance": {"apr": apr, "termMonths": fterm, "rebate": cash, "items": []},
            "lease":   {"terms": ({"36": {"monthlyPayment": lease_mo,
                                          "dueAtSigning": lease_down,
                                          "milesPerYear": 10000}} if lease_mo else {}),
                        "leaseCash": 0, "items": []},
            "other":   [],
        }
        out[name] = entry
    return out


def _summarise(deals: list[dict]) -> dict:
    """
    Collapse raw deal objects into the canonical per-vehicle incentive summary.
    """
    cash_rebate      = 0
    loyalty_bonus    = 0
    lease_monthly    = None
    lease_down       = None
    lease_term       = None
    lease_mileage    = None
    finance_apr      = None
    finance_term     = None

    for d in deals:
        dt = (d.get("type") or "").upper()

        if dt in ("REBATE", "CASH_BACK", "CUSTOMER_CASH", "BONUS_CASH", "DEALER_CASH"):
            v = d.get("amount") or 0
            if v > cash_rebate:
                cash_rebate = v

        elif dt == "LOYALTY":
            v = d.get("amount") or 0
            if v > loyalty_bonus:
                loyalty_bonus = v

        elif dt == "LEASE":
            mp = d.get("monthlyPayment")
            if mp and (lease_monthly is None or mp < lease_monthly):
                lease_monthly = mp
                lease_down  = d.get("downPayment")
                lease_term  = d.get("termMonths") or 36
                lease_mileage = d.get("mileagePerYear") or 10_000

        elif dt in ("APR", "LOW_APR", "FINANCE"):
            apr = d.get("apr")
            if apr is not None and (finance_apr is None or apr < finance_apr):
                finance_apr  = apr
                finance_term = d.get("termMonths") or 60

    return {
        "cashRebate":        cash_rebate,
        "loyaltyBonus":      loyalty_bonus,
        "leaseMonthly":      lease_monthly,
        "leaseDownPayment":  lease_down,
        "leaseTerm":         lease_term,
        "leaseMileagePerYear": lease_mileage,
        "financeApr":        finance_apr,
        "financeTerm":       finance_term,
        "totalIncentiveValue": cash_rebate + loyalty_bonus,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Main per-vehicle scrape
# ─────────────────────────────────────────────────────────────────────────────

def _pre_browse(vehicle: dict, year: int) -> None:
    """
    Visit the vehicle's model overview page before the deals page.
    This mimics how a human navigates: search → model page → Deals tab.
    Cloudflare scores sessions partly on navigation depth; a session that
    only ever hits /deals/ pages looks like a scraper.
    Failures are silently swallowed — this is best-effort.
    """
    make_slug  = _make_to_slug(vehicle.get("make", ""))
    model_slug = _model_to_slug(vehicle.get("model", ""))
    overview_url = f"{EDMUNDS_BASE}/{make_slug}/{model_slug}/{year}/"
    try:
        session = _get_session()
        r = session.get(
            overview_url,
            headers={**_NAV_HEADERS, "Referer": "https://www.edmunds.com/electric-car/"},
            impersonate=_IMPERSONATE,
            timeout=20,
            allow_redirects=True,
        )
        log.debug(f"  [pre-browse] {overview_url} → {r.status_code}")
        if r.status_code == 200:
            time.sleep(0.8)
    except Exception:
        pass


def scrape_vehicle(vehicle: dict, sleep_sec: float = 1.2) -> dict:
    """
    Fetch and parse the Edmunds deals page for one vehicle.

    Tries the current calendar year first (e.g. 2026) so we always pull the
    latest model-year deals, then falls back to the year stored in
    vehicles_summary.json (typically one year older).  A 403 short-circuits
    immediately — no point hammering Cloudflare with retries.

    Returns a fully populated incentive record (even if empty) so callers can
    distinguish "scraped with no deals" from "never scraped".
    """
    vid = vehicle.get("id", "?")
    now = datetime.now(timezone.utc).isoformat()
    current_year = datetime.now(timezone.utc).year
    vehicle_year = int(vehicle.get("year", current_year))

    # Build ordered list of years to try: current year first, then vehicle year
    years_to_try: list[int] = []
    if current_year != vehicle_year:
        years_to_try.append(current_year)
    years_to_try.append(vehicle_year)

    result: dict = {
        "edmundsUrl":  edmunds_url(vehicle, year_override=years_to_try[0]),
        "yearUsed":    None,
        "scrapedAt":   now,
        "scraped":     False,
        "error":       None,
        "zip":         DEFAULT_ZIP,
        "region":      DEFAULT_REGION,
        "deals":       [],
        "trims":       {},
        "leaseCash":   0,   # lease-only cash; shown in a popup, NOT in totals
        **_summarise([]),
    }

    html: Optional[str] = None

    # Visit the model overview page before the deals tab — looks like real
    # user navigation ("Browse model → click Deals") and helps with Cloudflare.
    _pre_browse(vehicle, years_to_try[0])

    for attempt_year in years_to_try:
        url = edmunds_url(vehicle, year_override=attempt_year)
        result["edmundsUrl"] = url

        fetch_result = _fetch(url)

        if isinstance(fetch_result, str):
            # Success
            html = fetch_result
            result["yearUsed"] = attempt_year
            if attempt_year != vehicle_year:
                log.info(f"  [{vid}] using {attempt_year} model year page")
            break

        if isinstance(fetch_result, _Blocked):
            if fetch_result.status == 403:
                log.warning(f"  [{vid}] Edmunds blocked (403) — bot detection triggered")
                result["error"] = "blocked_403"
                return result
            if fetch_result.status == 404:
                if attempt_year != years_to_try[-1]:
                    log.info(f"  [{vid}] {attempt_year} page not found, trying {years_to_try[years_to_try.index(attempt_year)+1]}...")
                    time.sleep(0.4)
                    continue
                # 404 on last year too
                result["error"] = "not_found_404"
                return result
            # Other 4xx
            result["error"] = f"http_{fetch_result.status}"
            return result

        # fetch_result is None → connection / network error
        result["error"] = "connection_error"
        log.warning(f"  [{vid}] connection error fetching {url}")
        return result

    if html is None:
        log.warning(f"  [{vid}] all year variants exhausted with no content")
        result["error"] = "no_content"
        return result

    result["scraped"] = True
    raw_deals: list[dict] = []

    # ── Try __NEXT_DATA__ first ────────────────────────────────────────────
    next_data = _extract_next_data(html)
    if next_data:
        found = _find_deals_in_json(next_data)
        for raw in found:
            nd = _normalize_deal(raw)
            if nd:
                raw_deals.append(nd)
        log.debug(f"  [{vid}] __NEXT_DATA__: {len(raw_deals)} deal object(s)")

    # ── JSON search in any embedded script blocks ──────────────────────────
    if not raw_deals:
        script_blobs = re.findall(
            r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>',
            html, re.DOTALL
        )
        for blob in script_blobs:
            try:
                data = json.loads(blob)
                for raw in _find_deals_in_json(data):
                    nd = _normalize_deal(raw)
                    if nd:
                        raw_deals.append(nd)
            except json.JSONDecodeError:
                pass
        if raw_deals:
            log.debug(f"  [{vid}] script blobs: {len(raw_deals)} deal object(s)")

    # ── HTML text regex fallback ──────────────────────────────────────────
    if not raw_deals:
        raw_deals = _parse_html_fallback(html)
        if raw_deals:
            log.debug(f"  [{vid}] HTML fallback: {len(raw_deals)} deal object(s)")

    if not raw_deals:
        log.info(f"  [{vid}] no deals found on page")

    result["deals"] = raw_deals
    result.update(_summarise(raw_deals))

    # ── Per-trim, per-payment-type offers ─────────────────────────────────────
    # Edmunds isn't Next.js, so the typed incentives live in a plain inline
    # <script>, not __NEXT_DATA__. We parse the raw HTML for the typed objects
    # (cash / finance / lease / lease-cash / other), grouped per trim. The
    # __NEXT_DATA__ path is kept as a secondary in case the layout ever changes.
    # Lease cash is captured separately so the app can show it in a popup without
    # folding it into the all-in total.
    # The deals page only embeds the selected trim's incentives. Walking every
    # trim multiplies requests and trips Edmunds' 403 wall, so it's opt-in
    # (--per-trim-fetch). The offline parser (parse_local_deals.py) is the
    # reliable route to true per-trim data. Default: single page (still captures
    # all payment types for the default trim).
    if PER_TRIM_FETCH:
        v2 = _build_v2_multistyle(result["edmundsUrl"], html, vid, sleep_sec=sleep_sec)
        if not v2.get("trims"):
            v2 = _extract_incentives_v2_raw(html)
    else:
        v2 = _extract_incentives_v2_raw(html)
    if not v2.get("trims") and next_data:
        v2 = _extract_incentives_v2(next_data)
    if v2.get("trims"):
        result["trims"] = v2["trims"]
        m = v2["model"]
        # Re-derive the legacy/model-level summary from the typed data so older
        # consumers (and the matcher) use the real numbers.
        result["cashRebate"]   = m["cash"]["rebate"] or 0
        result["financeApr"]   = m["finance"]["apr"]
        result["financeTerm"]  = m["finance"]["termMonths"] or 60
        lease36 = m["lease"]["terms"].get("36") or m["lease"]["terms"].get("24") or {}
        result["leaseMonthly"]      = lease36.get("monthlyPayment")
        result["leaseDownPayment"]  = lease36.get("dueAtSigning")
        result["leaseTerm"]         = 36 if "36" in m["lease"]["terms"] else (24 if "24" in m["lease"]["terms"] else None)
        result["leaseCash"]         = m["lease"]["leaseCash"] or 0   # popup only — NOT in totals
        result["totalIncentiveValue"] = (m["cash"]["rebate"] or 0)
        log.info(f"  [{vid}] v2 per-trim offers: {len(v2['trims'])} trim(s)")
    else:
        result["trims"] = _per_trim_offers_fallback(vid, result)
        result["leaseCash"] = 0

    result["zip"] = DEFAULT_ZIP
    result["region"] = DEFAULT_REGION

    summary_parts = []
    if result["cashRebate"]:
        summary_parts.append(f"cash=${result['cashRebate']:,}")
    if result.get("leaseCash"):
        summary_parts.append(f"leaseCash=${result['leaseCash']:,}(popup)")
    if result["leaseMonthly"]:
        summary_parts.append(f"lease=${result['leaseMonthly']}/mo")
    if result["financeApr"] is not None:
        summary_parts.append(f"APR={result['financeApr']}%")
    log.info(f"  [{vid}] {', '.join(summary_parts) or 'no deals'}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Optional: patch vehicles_summary.json with real Edmunds lease/finance data
# ─────────────────────────────────────────────────────────────────────────────

def _patch_summary(vehicle_results: dict[str, dict], dry_run: bool) -> int:
    """
    Update leaseFrom / financeFrom in vehicles_summary.json with real Edmunds
    numbers. Only overwrites when we actually scraped a real value.
    Returns count of vehicles patched.
    """
    if not SUMMARY_IN.exists():
        return 0
    summary = json.loads(SUMMARY_IN.read_text("utf-8"))
    patched = 0
    for v in summary:
        vid = v.get("id", "")
        res = vehicle_results.get(vid)
        if not res or not res.get("scraped"):
            continue
        changed = False
        if res["leaseMonthly"] and res["leaseMonthly"] != v.get("leaseFrom"):
            v["leaseFrom"]    = res["leaseMonthly"]
            v["offerExpiresAt"] = None  # will be refreshed next run
            changed = True
        # Only update financeFrom if we have a real APR deal (to derive monthly)
        if res["financeApr"] is not None:
            msrp = v.get("msrpFrom") or 0
            if msrp > 0:
                p = msrp * 0.90
                r = res["financeApr"] / 100 / 12
                n = res["financeTerm"] or 60
                if r > 0:
                    pmt = (p * r * (1 + r) ** n) / ((1 + r) ** n - 1)
                else:
                    pmt = p / n
                new_finance = int(round(pmt))
                if new_finance != v.get("financeFrom"):
                    v["financeFrom"] = new_finance
                    changed = True
        if changed:
            patched += 1
    if patched and not dry_run:
        SUMMARY_IN.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        log.info(f"Patched {patched} vehicle(s) in vehicles_summary.json")
    return patched


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

def run_edmunds_pull(
    vehicle_filter: Optional[str]    = None,
    patch_summary:  bool             = False,
    dry_run:        bool             = False,
    sleep_between:  float            = 2.5,
    max_vehicles:   Optional[int]    = None,
    skip_existing:  bool             = False,
) -> dict:
    """
    Scrape Edmunds deals pages for all vehicles in vehicles_summary.json.

    Args:
        vehicle_filter: If set, only process this vehicle ID.
        patch_summary:  If True, write real lease/finance values back into
                        vehicles_summary.json.
        dry_run:        If True, fetch and parse but don't write any files.
        sleep_between:  Seconds to wait between requests (be polite).
        max_vehicles:   Cap the number of vehicles processed (useful for testing).

    Returns a report dict with counts and per-vehicle status.
    """
    started = datetime.now(timezone.utc)

    if not SUMMARY_IN.exists():
        log.error(f"vehicles_summary.json not found at {SUMMARY_IN}")
        return {"error": "missing_summary", "startedAt": started.isoformat()}

    all_vehicles = json.loads(SUMMARY_IN.read_text("utf-8"))

    # Apply filter
    if vehicle_filter:
        all_vehicles = [v for v in all_vehicles if v.get("id") == vehicle_filter]
        if not all_vehicles:
            log.warning(f"No vehicle with id={vehicle_filter!r} in summary")
            return {"error": "vehicle_not_found", "vehicleFilter": vehicle_filter}

    # Skip vehicles that already have successful data in the existing output file
    if skip_existing and VEHICLE_PATH.exists():
        try:
            existing_data = json.loads(VEHICLE_PATH.read_text("utf-8"))
            existing_vehicles = existing_data.get("vehicles", {})
            already_ok = {vid for vid, v in existing_vehicles.items() if v.get("scraped")}
            before = len(all_vehicles)
            all_vehicles = [v for v in all_vehicles if v.get("id") not in already_ok]
            log.info(f"--skip-existing: {before - len(all_vehicles)} already scraped, "
                     f"{len(all_vehicles)} to process")
        except Exception:
            pass

    if max_vehicles:
        all_vehicles = all_vehicles[:max_vehicles]

    total   = len(all_vehicles)
    results: dict[str, dict] = {}
    ok_count     = 0
    deal_count   = 0
    fail_count   = 0

    log.info(f"Edmunds scraper: {total} vehicle(s) to process")

    consecutive_blocks = 0
    MAX_CONSECUTIVE_BLOCKS = 5  # Give up after 5 straight 403s
    BLOCK_WAIT_SECS = 90        # Wait 90 s when blocked, then try one more time

    for i, vehicle in enumerate(all_vehicles, 1):
        vid = vehicle.get("id", "?")
        log.info(f"[{i}/{total}] {vehicle.get('year')} {vehicle.get('make')} {vehicle.get('model')}")
        try:
            res = scrape_vehicle(vehicle, sleep_sec=sleep_between)
            results[vid] = res
            if res.get("scraped"):
                ok_count += 1
                consecutive_blocks = 0
                if res.get("deals"):
                    deal_count += len(res["deals"])
            else:
                fail_count += 1
                if res.get("error") == "blocked_403":
                    consecutive_blocks += 1
                    if consecutive_blocks >= MAX_CONSECUTIVE_BLOCKS:
                        log.warning(
                            f"  {consecutive_blocks} consecutive 403s — stopping early. "
                            f"Re-run with --skip-existing after a break to fill in the rest."
                        )
                        break
                    elif consecutive_blocks == 2:
                        # After 2 in a row, give the IP some breathing room
                        log.info(f"  2 consecutive blocks — waiting {BLOCK_WAIT_SECS}s...")
                        time.sleep(BLOCK_WAIT_SECS)
                        _reset_pw_session()
                else:
                    consecutive_blocks = 0
        except Exception as e:
            log.error(f"  [{vid}] unhandled error: {e}")
            results[vid] = {"error": str(e), "scraped": False}
            fail_count += 1

        if i < total:
            time.sleep(sleep_between)

    # Optionally patch vehicles_summary.json
    patched_count = 0
    if patch_summary and not dry_run:
        patched_count = _patch_summary(results, dry_run=False)
    elif patch_summary and dry_run:
        patched_count = _patch_summary(results, dry_run=True)

    # Write output file — always merge with existing data so single-vehicle runs
    # (--vehicle flag) never wipe results for other vehicles.
    merged_vehicles: dict = {}
    if VEHICLE_PATH.exists():
        try:
            existing = json.loads(VEHICLE_PATH.read_text("utf-8"))
            merged_vehicles = existing.get("vehicles", {})
        except Exception:
            pass
    # New results override existing (fresh scrape wins) — EXCEPT we never clobber
    # a hand-curated entry (source ending in "-manual", e.g. Lucid) with an empty
    # Edmunds result. Edmunds doesn't carry every brand, so a "no deals" scrape
    # must not wipe manually-entered incentives.
    for vid, res in results.items():
        old = merged_vehicles.get(vid)
        if (old and str(old.get("source", "")).endswith("-manual")
                and not (res.get("cashRebate") or res.get("financeApr") is not None
                         or res.get("leaseMonthly") or res.get("leaseCash") or res.get("trims"))):
            continue  # keep the curated entry
        merged_vehicles[vid] = res

    output = {
        "lastUpdated": started.isoformat(),
        "source": "edmunds",
        "zip": DEFAULT_ZIP,
        "region": DEFAULT_REGION,
        "note": (
            f"DEMO SCOPE: manufacturer offers localized to {DEFAULT_REGION} "
            f"(ZIP {DEFAULT_ZIP}). cash/finance/lease only; no state purchase "
            f"rebate. Per-trim offers under each vehicle's `trims`."
        ),
        "vehicles": merged_vehicles,
    }
    if not dry_run:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        VEHICLE_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
        log.info(f"Wrote {VEHICLE_PATH} ({len(merged_vehicles)} total vehicles)")

    return {
        "startedAt":     started.isoformat(),
        "finishedAt":    datetime.now(timezone.utc).isoformat(),
        "total":         total,
        "scraped":       ok_count,
        "failed":        fail_count,
        "dealsFound":    deal_count,
        "summaryPatched": patched_count,
        "vehiclePath":   str(VEHICLE_PATH),
        "dryRun":        dry_run,
    }


# ── Env loader (for CLI usage without shell exports) ─────────────────────────
def _load_local_env() -> None:
    env_file = SCRAPER_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ── CLI ──────────────────────────────────────────────────────────────────────
def _main():
    global DEFAULT_ZIP, DEFAULT_REGION, PER_TRIM_FETCH
    _load_local_env()

    if sys.platform == "win32":
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Edmunds per-vehicle incentive scraper")
    parser.add_argument("--vehicle", default=None,
                        help="Only process this vehicle id (e.g. chevrolet-equinox-ev-2025)")
    parser.add_argument("--max", type=int, default=None,
                        help="Cap vehicles processed (default: all)")
    parser.add_argument("--patch-summary", action="store_true",
                        help="Write real leaseFrom/financeFrom back into vehicles_summary.json")
    parser.add_argument("--sleep", type=float, default=2.5,
                        help="Seconds between requests (default 2.5 — lower risks 403)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch + parse but don't write any files")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip vehicles that already have a successful scrape in the output file")
    parser.add_argument("--zip", default=DEFAULT_ZIP,
                        help=f"ZIP code to localize deals to (default {DEFAULT_ZIP} — NY demo)")
    parser.add_argument("--region", default=DEFAULT_REGION,
                        help=f"Region label stamped on the output (default {DEFAULT_REGION})")
    parser.add_argument("--per-trim-fetch", action="store_true",
                        help="Walk the trim dropdown and fetch each trim's page "
                             "(slow + high 403 risk; prefer parse_local_deals.py)")
    args = parser.parse_args()

    # Pin the demo localization for this run.
    DEFAULT_ZIP = args.zip
    DEFAULT_REGION = args.region
    PER_TRIM_FETCH = args.per_trim_fetch

    report = run_edmunds_pull(
        vehicle_filter=args.vehicle,
        patch_summary=args.patch_summary,
        dry_run=args.dry_run,
        sleep_between=args.sleep,
        max_vehicles=args.max,
        skip_existing=args.skip_existing,
    )
    print("\n" + json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    _main()
