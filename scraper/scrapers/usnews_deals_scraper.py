"""
usnews_deals_scraper.py -- Scrapes current EV deals from US News.

Strategy:
  - Each vehicle has a per-model deals page:
    https://cars.usnews.com/cars-trucks/{make}/{model-slug}
    This page has a "Car Deals" section with structured incentive data.
  - Scrape once per make, cache results, share across all models of that make.
  - Uses undetected-chromedriver Selenium (most reliable for JS-heavy sites).
  - Tesla routes to tesla.com/current-offers instead.

Two-level caching:
  1. Module-level _MAKE_CACHE: once a make's page is fetched, all vehicles
     of that make reuse the same text -- no redundant Selenium launches.
  2. Per-model fallback: if make-level page doesn't have model-specific deals,
     load the individual model page.

Data written to Firestore: vehicles/{id}.currentDeals = {
    cashBack:     [{amount, description, expiresAt}],
    financeDeals: [{apr, termMonths, description, expiresAt}],
    leaseDeals:   [{monthlyPayment, termMonths, dueAtSigning, description, expiresAt}],
    lastScraped, sourceUrl,
}
"""

import asyncio
import argparse
import re
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S, setup_logging
import logging
setup_logging()

# -- URL patterns -------------------------------------------------------------
USNEWS_MAKE_DEALS = {
    "hyundai":    "https://cars.usnews.com/cars-trucks/best-car-deals/hyundai-deals",
    "kia":        "https://cars.usnews.com/cars-trucks/best-car-deals/kia-deals",
    "ford":       "https://cars.usnews.com/cars-trucks/best-car-deals/ford-deals",
    "chevrolet":  "https://cars.usnews.com/cars-trucks/best-car-deals/chevrolet-deals",
    "rivian":     "https://cars.usnews.com/cars-trucks/best-car-deals/rivian-deals",
    "bmw":        "https://cars.usnews.com/cars-trucks/best-car-deals/bmw-deals",
    "volkswagen": "https://cars.usnews.com/cars-trucks/best-car-deals/volkswagen-deals",
    "lucid":      "https://cars.usnews.com/cars-trucks/best-car-deals/lucid-deals",
    "polestar":   "https://cars.usnews.com/cars-trucks/best-car-deals/polestar-deals",
}

# Per-model deal pages -- richer data, loaded as fallback for models not
# found on the make-level page.
USNEWS_MODEL_DEALS = {
    "hyundai-ioniq-5-2025":        "https://cars.usnews.com/cars-trucks/hyundai/ioniq-5/prices",
    "hyundai-ioniq-6-2025":        "https://cars.usnews.com/cars-trucks/hyundai/ioniq-6/prices",
    "hyundai-ioniq-9-2025":        "https://cars.usnews.com/cars-trucks/hyundai/ioniq-9/prices",
    "kia-ev6-2025":                "https://cars.usnews.com/cars-trucks/kia/ev6/prices",
    "kia-ev9-2025":                "https://cars.usnews.com/cars-trucks/kia/ev9/prices",
    "ford-mustang-mach-e-2025":    "https://cars.usnews.com/cars-trucks/ford/mustang-mach-e/prices",
    "ford-f-150-lightning-2025":   "https://cars.usnews.com/cars-trucks/ford/f-150-lightning/prices",
    "chevrolet-equinox-ev-2025":   "https://cars.usnews.com/cars-trucks/chevrolet/equinox-ev/prices",
    "chevrolet-blazer-ev-2025":    "https://cars.usnews.com/cars-trucks/chevrolet/blazer-ev/prices",
    "chevrolet-silverado-ev-2025": "https://cars.usnews.com/cars-trucks/chevrolet/silverado-ev/prices",
    "rivian-r1t-2025":             "https://cars.usnews.com/cars-trucks/rivian/r1t/prices",
    "rivian-r1s-2025":             "https://cars.usnews.com/cars-trucks/rivian/r1s/prices",
    "bmw-i4-2025":                 "https://cars.usnews.com/cars-trucks/bmw/i4/prices",
    "bmw-ix-2025":                 "https://cars.usnews.com/cars-trucks/bmw/ix/prices",
    "bmw-i5-2025":                 "https://cars.usnews.com/cars-trucks/bmw/i5/prices",
    "bmw-i7-2025":                 "https://cars.usnews.com/cars-trucks/bmw/i7/prices",
    "volkswagen-id4-2025":         "https://cars.usnews.com/cars-trucks/volkswagen/id4/prices",
    "lucid-air-2025":              "https://cars.usnews.com/cars-trucks/lucid/air/prices",
    "polestar-polestar-2-2025":    "https://cars.usnews.com/cars-trucks/polestar/polestar-2/prices",
    "polestar-polestar-3-2025":    "https://cars.usnews.com/cars-trucks/polestar/polestar-3/prices",
}

TESLA_OFFERS_URL = "https://www.tesla.com/current-offers"

# Module-level cache: make -> page_text.  Prevents re-launching Selenium for
# each vehicle of the same make within one scrape run.
_MAKE_CACHE: dict[str, str] = {}


# -- Keyword -> vehicle ID mapping per make ----------------------------------
VEHICLE_KEYWORDS: dict[str, list[tuple[str, str]]] = {
    "hyundai":   [("ioniq 5", "hyundai-ioniq-5-2025"), ("ioniq 6", "hyundai-ioniq-6-2025"), ("ioniq 9", "hyundai-ioniq-9-2025")],
    "kia":       [("ev6", "kia-ev6-2025"), ("ev9", "kia-ev9-2025")],
    "ford":      [("mach-e", "ford-mustang-mach-e-2025"), ("mach e", "ford-mustang-mach-e-2025"), ("mustang mach", "ford-mustang-mach-e-2025"), ("lightning", "ford-f-150-lightning-2025"), ("f-150 lightning", "ford-f-150-lightning-2025")],
    "chevrolet": [("equinox ev", "chevrolet-equinox-ev-2025"), ("blazer ev", "chevrolet-blazer-ev-2025"), ("silverado ev", "chevrolet-silverado-ev-2025")],
    "rivian":    [("r1t", "rivian-r1t-2025"), ("r1s", "rivian-r1s-2025")],
    "bmw":       [("bmw i4", "bmw-i4-2025"), (" i4 ", "bmw-i4-2025"), ("bmw ix", "bmw-ix-2025"), (" ix ", "bmw-ix-2025"), ("bmw i5", "bmw-i5-2025"), (" i5 ", "bmw-i5-2025"), ("bmw i7", "bmw-i7-2025"), (" i7 ", "bmw-i7-2025")],
    "volkswagen":[("id.4", "volkswagen-id4-2025"), ("id4", "volkswagen-id4-2025"), ("id. buzz", "volkswagen-id-buzz-2025")],
    "lucid":     [("lucid air", "lucid-air-2025"), ("lucid gravity", "lucid-gravity-2025")],
    "polestar":  [("polestar 2", "polestar-polestar-2-2025"), ("polestar 3", "polestar-polestar-3-2025"), ("polestar 4", "polestar-polestar-4-2025")],
    "tesla":     [("model 3", "tesla-model3-2025"), ("model y", "tesla-modely-2025"), ("model s", "tesla-models-2025"), ("model x", "tesla-modelx-2025"), ("cybertruck", "tesla-cybertruck-2025")],
}


# ---------------------------------------------------------------------------
# Selenium fetcher (sync, called via run_in_executor)
# ---------------------------------------------------------------------------

def _fetch_page_selenium(url: str, label: str, wait_secs: float = 4.0) -> str:
    """
    Load a URL with undetected-chromedriver and return body.innerText.
    Creates a fresh driver, fetches one page, closes.
    """
    from scrapers.selenium_base import SeleniumScraper
    import time

    scraper = SeleniumScraper()
    try:
        driver = scraper.get_driver()
        driver.get(url)
        time.sleep(wait_secs)
        try:
            text = driver.execute_script("return document.body.innerText") or ""
        except Exception:
            text = driver.page_source or ""
        logging.info(f"  Selenium [{label}]: {len(text)} chars from {url}")
        return text
    except Exception as e:
        logging.warning(f"  Selenium [{label}] failed: {e}")
        return ""
    finally:
        scraper.close()


# ---------------------------------------------------------------------------
# Deal parsers
# ---------------------------------------------------------------------------

def _extract_expiry(text: str) -> Optional[str]:
    for pat in [
        r'[Ee]xpires?\s+(\d{1,2}/\d{1,2}/\d{2,4})',
        r'[Tt]hrough\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)[^\n]{0,10}',
        r'(\d{1,2}/\d{1,2}/\d{2,4})',
    ]:
        m = re.search(pat, text)
        if m:
            return m.group(0)
    return None


def _clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def _parse_deals_from_text(text: str, make: str) -> dict[str, dict]:
    """
    Parse deal information from a page's text content.
    Returns dict keyed by vehicle_id -> structured deal dict:
    { cashBack: [...], financeDeals: [...], leaseDeals: [...], ... }
    """
    keywords = VEHICLE_KEYWORDS.get(make, [])
    cash_by_id:  dict[str, list] = {}
    fin_by_id:   dict[str, list] = {}
    lease_by_id: dict[str, list] = {}

    paragraphs = re.split(r'\n+', text)

    for para in paragraphs:
        if len(para.strip()) < 15:
            continue
        para_lower = para.lower()

        # Find which vehicle this paragraph is about
        vid = None
        for keyword, vehicle_id in keywords:
            if keyword in para_lower:
                vid = vehicle_id
                break
        if not vid:
            continue

        expiry = _extract_expiry(para)
        desc = _clean(para)[:200]

        # Cash back / bonus cash
        for m in re.finditer(
            r'\$([\d,]+)\s*(?:cash[\s-]?back|bonus[\s-]?cash|customer[\s-]?cash|cash[\s-]?allowance|rebate|savings?|discount|off)',
            para, re.IGNORECASE
        ):
            amt = int(m.group(1).replace(',', ''))
            if 100 <= amt <= 15000:
                cash_by_id.setdefault(vid, []).append({"amount": amt, "description": desc, "expiresAt": expiry})

        # APR finance deals
        for m in re.finditer(
            r'(\d+\.?\d*)\s*%\s*(?:APR|financing|annual percentage)[^\n]{0,50}?(\d+)\s*month',
            para, re.IGNORECASE
        ):
            apr, term = float(m.group(1)), int(m.group(2))
            if apr <= 15 and 12 <= term <= 84:
                fin_by_id.setdefault(vid, []).append({"apr": apr, "termMonths": term, "description": desc, "expiresAt": expiry})

        # 0% APR without explicit "X months" nearby -- still valuable
        for m in re.finditer(r'\b0\s*%\s*(?:APR|financing)\b', para, re.IGNORECASE):
            term_m = re.search(r'(\d+)\s*month', para, re.IGNORECASE)
            term = int(term_m.group(1)) if term_m else 60
            fin_by_id.setdefault(vid, []).append({"apr": 0.0, "termMonths": term, "description": desc, "expiresAt": expiry})

        # Lease deals
        for m in re.finditer(
            r'\$([\d,]+)\s*(?:/mo|per\s+month|monthly)[^\n]{0,80}?(\d+)\s*month',
            para, re.IGNORECASE
        ):
            pmt, term = int(m.group(1).replace(',', '')), int(m.group(2))
            if 100 <= pmt <= 2500 and 24 <= term <= 60:
                das_m = re.search(r'\$([\d,]+)\s*(?:due at signing|down|at signing)', para, re.IGNORECASE)
                das = int(das_m.group(1).replace(',', '')) if das_m else None
                lease_by_id.setdefault(vid, []).append({
                    "monthlyPayment": pmt, "termMonths": term,
                    "dueAtSigning": das, "description": desc, "expiresAt": expiry,
                })

    # Build structured output
    now = datetime.now(timezone.utc).isoformat()
    result: dict[str, dict] = {}
    for vid in set(cash_by_id) | set(fin_by_id) | set(lease_by_id):
        result[vid] = {
            "cashBack":     cash_by_id.get(vid, []),
            "financeDeals": fin_by_id.get(vid, []),
            "leaseDeals":   lease_by_id.get(vid, []),
            "lastScraped":  now,
            "sourceUrl":    "",  # set by caller
        }

    total = sum(len(d["cashBack"]) + len(d["financeDeals"]) + len(d["leaseDeals"]) for d in result.values())
    if total:
        logging.info(f"  Parsed {total} deal(s) across {len(result)} vehicle(s) for {make}")
    return result


# ---------------------------------------------------------------------------
# Tesla-specific scraper
# ---------------------------------------------------------------------------

async def _scrape_tesla_offers() -> dict[str, dict]:
    """Load tesla.com/current-offers via Selenium, parse all model deals."""
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, _fetch_page_selenium, TESLA_OFFERS_URL, "tesla-offers", 4.0)
    if not text or len(text) < 300:
        return {}
    result = _parse_deals_from_text(text, "tesla")
    for v in result.values():
        v["sourceUrl"] = TESLA_OFFERS_URL
    return result


# ---------------------------------------------------------------------------
# Main entry point called by brand scrapers
# ---------------------------------------------------------------------------

async def scrape_make_deals(make: str, dry_run: bool = False) -> dict[str, dict]:
    """
    Scrape deals for a given make.
    Returns dict[vehicle_id -> deal_dict] where deal_dict has:
        { cashBack: [...], financeDeals: [...], leaseDeals: [...],
          lastScraped: str, sourceUrl: str }

    Tesla -> tesla.com/current-offers
    Others -> US News make-level page (cached), then per-model page fallback.
    """
    if make == "tesla":
        return await _scrape_tesla_offers()

    url = USNEWS_MAKE_DEALS.get(make)
    if not url:
        logging.info(f"  No deal URL for make: {make}")
        return {}

    # Use cached page text if we already fetched this make this run
    if make in _MAKE_CACHE:
        text = _MAKE_CACHE[make]
        logging.info(f"  US News [{make}]: using cached page ({len(text)} chars)")
    else:
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _fetch_page_selenium, url, f"usnews-{make}", 4.0)
        _MAKE_CACHE[make] = text

    if not text or len(text) < 500:
        logging.info(f"  US News [{make}]: no usable content")
        return {}

    result = _parse_deals_from_text(text, make)
    for v in result.values():
        v["sourceUrl"] = url
    return result


async def scrape_vehicle_deals(vehicle_id: str) -> dict:
    """
    Scrape the per-model US News deals page for a specific vehicle.
    Used as a fallback when make-level page has no deals for this vehicle.
    """
    url = USNEWS_MODEL_DEALS.get(vehicle_id)
    if not url:
        return {}

    make = vehicle_id.split("-")[0]
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, _fetch_page_selenium, url, f"usnews-{vehicle_id}", 3.5)

    if not text or len(text) < 300:
        return {}

    result = _parse_deals_from_text(text, make)
    deal = result.get(vehicle_id, {})
    if deal:
        deal["sourceUrl"] = url
    return deal


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

async def run_usnews_deals_scraper(
    make_filter: Optional[str] = None,
    dry_run: bool = False,
):
    """Run the US News deals scraper for all makes and write to Firestore."""
    logging.info("\n" + "=" * 50)
    logging.info("  US News Car Deals Scraper")
    logging.info("=" * 50)

    makes = [make_filter] if make_filter else list(USNEWS_MAKE_DEALS.keys()) + ["tesla"]

    if not dry_run:
        from firebase_client import FirebaseClient
        db_client = FirebaseClient()

    total_written = 0

    for make in makes:
        logging.info(f"\nScraping deals for {make}...")
        deals = await scrape_make_deals(make, dry_run)

        for vehicle_id, deal in deals.items():
            if dry_run:
                total = len(deal.get("cashBack", [])) + len(deal.get("financeDeals", [])) + len(deal.get("leaseDeals", []))
                logging.info(f"  [{vehicle_id}] DRY RUN -- {total} deal(s)")
            else:
                db_client._db.collection("vehicles").document(vehicle_id).set(
                    {"currentDeals": deal}, merge=True
                )
                total_written += 1

        import random
        await asyncio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))

    logging.info(f"\nDone -- {total_written} vehicles updated{'  (DRY RUN)' if dry_run else ''}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="US News Car Deals Scraper")
    parser.add_argument("--make", help="Single make (e.g. hyundai)")
    parser.add_argument("--vehicle", help="Single vehicle ID (e.g. hyundai-ioniq-6-2025)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.vehicle:
        async def _run():
            d = await scrape_vehicle_deals(args.vehicle)
            logging.info(f"Result: {d}")
        asyncio.run(_run())
    else:
        asyncio.run(run_usnews_deals_scraper(
            make_filter=args.make,
            dry_run=args.dry_run,
        ))