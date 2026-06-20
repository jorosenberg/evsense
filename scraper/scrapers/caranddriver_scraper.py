"""
caranddriver_scraper.py -- Scrapes vehicle specs from Car and Driver.

Car and Driver publishes detailed, structured specs pages for every vehicle:
  https://www.caranddriver.com/{make}/{model}/specs/{year}/

What we extract:
  - Powertrain: horsepower, torque, 0-60, top speed
  - Battery/range: EPA range, battery capacity, charging speeds
  - Dimensions: cargo volume, seating, weight, towing
  - Pricing: base MSRP per trim (from the specs table)

URL pattern:
  https://www.caranddriver.com/ford/mustang-mach-e/specs/2025/ford_mustang_mach-e_ford-mustang-mach-e_2025/
  Short form also works:
  https://www.caranddriver.com/ford/mustang-mach-e/specs

Strategy:
  1. httpx GET the specs page (Car and Driver is SSR -- no JS needed for specs)
  2. Parse the structured specs table with BeautifulSoup
  3. Extract JSON-LD schema.org data for structured pricing/specs
  4. Write to Firestore as specs fallback (only fills fields not already set)

Usage:
    python scraper/scrapers/caranddriver_scraper.py
    python scraper/scrapers/caranddriver_scraper.py --vehicle ford-mustang-mach-e-2025
    python scraper/scrapers/caranddriver_scraper.py --dry-run
"""

import asyncio
import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S, setup_logging

import logging
setup_logging()

# -- Vehicle URL map ----------------------------------------------------------
# Maps our Firestore vehicle IDs to Car and Driver specs URLs.
# Use the short /specs URL which redirects to the current model year.
VEHICLE_URLS = {
    "tesla-model-3-2025":          "https://www.caranddriver.com/tesla/model-3/specs",
    "tesla-model-y-2025":          "https://www.caranddriver.com/tesla/model-y/specs",
    "tesla-model-s-2025":          "https://www.caranddriver.com/tesla/model-s/specs",
    "tesla-model-x-2025":          "https://www.caranddriver.com/tesla/model-x/specs",
    "tesla-cybertruck-2025":       "https://www.caranddriver.com/tesla/cybertruck/specs",
    "ford-mustang-mach-e-2025":    "https://www.caranddriver.com/ford/mustang-mach-e/specs",
    "ford-f-150-lightning-2025":   "https://www.caranddriver.com/ford/f-150-lightning/specs",
    "chevrolet-equinox-ev-2025":   "https://www.caranddriver.com/chevrolet/equinox-ev/specs",
    "chevrolet-blazer-ev-2025":    "https://www.caranddriver.com/chevrolet/blazer-ev/specs",
    "chevrolet-silverado-ev-2025": "https://www.caranddriver.com/chevrolet/silverado-ev/specs",
    "hyundai-ioniq-5-2025":        "https://www.caranddriver.com/hyundai/ioniq-5/specs",
    "hyundai-ioniq-6-2025":        "https://www.caranddriver.com/hyundai/ioniq-6/specs",
    "kia-ev6-2025":                "https://www.caranddriver.com/kia/ev6/specs",
    "kia-ev9-2025":                "https://www.caranddriver.com/kia/ev9/specs",
    "volkswagen-id4-2025":         "https://www.caranddriver.com/volkswagen/id4/specs",
    "rivian-r1t-2025":             "https://www.caranddriver.com/rivian/r1t/specs",
    "rivian-r1s-2025":             "https://www.caranddriver.com/rivian/r1s/specs",
    "bmw-i4-2025":                 "https://www.caranddriver.com/bmw/i4/specs",
    "bmw-ix-2025":                 "https://www.caranddriver.com/bmw/ix/specs",
    "bmw-i5-2025":                 "https://www.caranddriver.com/bmw/i5/specs",
    "lucid-air-2025":              "https://www.caranddriver.com/lucid/air/specs",
    "polestar-polestar-2-2025":    "https://www.caranddriver.com/polestar/polestar-2/specs",
    "polestar-polestar-3-2025":    "https://www.caranddriver.com/polestar/polestar-3/specs",
}

# -- Spec field mapping -------------------------------------------------------
# Maps Car and Driver's spec label text -> our Firestore field names.
# C&D uses human-readable labels in their spec tables.
SPEC_MAP = {
    # Performance
    "horsepower":                  ("specs.horsepower",              int),
    "hp":                          ("specs.horsepower",              int),
    "torque":                      ("specs.torqueLbFt",              int),
    "lb-ft":                       ("specs.torqueLbFt",              int),
    "0-60 mph":                    ("specs.zeroToSixty",             float),
    "zero to 60 mph":              ("specs.zeroToSixty",             float),
    "top speed":                   ("specs.topSpeed",                int),
    "top track speed":             ("specs.topSpeed",                int),

    # Battery & range
    "epa range":                   ("specs.range",                   int),
    "range":                       ("specs.range",                   int),
    "battery capacity":            ("specs.batteryKwh",              float),
    "usable battery capacity":     ("specs.batteryKwh",              float),
    "dc fast charging":            ("specs.chargingSpeedDcFastKw",   int),
    "max dc charging rate":        ("specs.chargingSpeedDcFastKw",   int),
    "onboard charger":             ("specs.chargingSpeedL2Kw",       float),
    "level 2 charging rate":       ("specs.chargingSpeedL2Kw",       float),

    # Dimensions
    "seating":                     ("specs.seatingCapacity",         int),
    "passenger volume":            ("specs.passengerVolumeCuFt",     float),
    "cargo volume":                ("specs.cargoVolumeCuFt",         float),
    "cargo volume, rear":          ("specs.cargoVolumeCuFt",         float),
    "front trunk":                 ("specs.frunkVolumeCuFt",         float),
    "towing capacity":             ("specs.towingCapacityLbs",       int),
    "max towing":                  ("specs.towingCapacityLbs",       int),
    "curb weight":                 ("specs.weightLbs",               int),
    "ground clearance":            ("specs.groundClearanceIn",       float),

    # Pricing
    "base price":                  ("msrpFrom",                      int),
    "price as tested":             ("priceAsTested",                 int),
}


def parse_number(text: str) -> Optional[float]:
    """Extract the first number from a string like '335 hp' or '$74,990'."""
    text = text.replace(",", "").replace("$", "")
    match = re.search(r"(\d+\.?\d*)", text)
    return float(match.group(1)) if match else None


def parse_specs_from_soup(soup: BeautifulSoup, vehicle_id: str) -> dict:
    """
    Parse the C&D specs page HTML into a flat dict of spec fields.
    C&D renders specs in <table> elements and also embeds JSON-LD.
    """
    specs = {}
    source_url = VEHICLE_URLS.get(vehicle_id, "https://www.caranddriver.com")

    # -- Strategy 1: JSON-LD schema.org data ----------------------------------
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if not isinstance(data, dict):
                continue
            # Car and Driver uses schema.org/Car
            if "Car" in str(data.get("@type", "")):
                # Extract price
                price = data.get("offers", {}).get("price") or data.get("price")
                if price:
                    try:
                        specs["msrpFrom"] = int(float(str(price).replace(",", "")))
                    except ValueError:
                        pass
                # Extract specs from vehicleEngine etc.
                engine = data.get("vehicleEngine", {})
                if engine.get("torque"):
                    val = parse_number(str(engine["torque"]))
                    if val:
                        specs["specs.torqueLbFt"] = int(val)
                if engine.get("enginePower"):
                    val = parse_number(str(engine["enginePower"]))
                    if val:
                        specs["specs.horsepower"] = int(val)
        except Exception:
            pass

    # -- Strategy 2: Specs table rows ----------------------------------------
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue

            label = cells[0].get_text(strip=True).lower()
            value_text = cells[-1].get_text(strip=True)

            # Try each mapping
            for key, (field, cast) in SPEC_MAP.items():
                if key in label:
                    num = parse_number(value_text)
                    if num is not None:
                        try:
                            specs[field] = cast(num)
                        except (ValueError, TypeError):
                            pass
                    break

    # -- Strategy 3: Definition lists (C&D also uses dl/dt/dd) ----------------
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            label = dt.get_text(strip=True).lower()
            value_text = dd.get_text(strip=True)
            for key, (field, cast) in SPEC_MAP.items():
                if key in label:
                    num = parse_number(value_text)
                    if num is not None:
                        try:
                            specs[field] = cast(num)
                        except (ValueError, TypeError):
                            pass
                    break

    # -- Strategy 4: Look for spec values in text patterns -------------------
    full_text = soup.get_text()

    # EPA range: "XXX miles EPA-estimated range" or "EPA range: XXX"
    range_match = re.search(r"(\d{2,3})\s*(?:miles?|mi)\s*(?:EPA|estimated)", full_text, re.IGNORECASE)
    if range_match and "specs.range" not in specs:
        specs["specs.range"] = int(range_match.group(1))

    # 0-60: "X.X seconds" near "0-60" or "zero to 60"
    accel_match = re.search(r"0.to.60.*?(\d+\.\d+)\s*sec", full_text, re.IGNORECASE)
    if accel_match and "specs.zeroToSixty" not in specs:
        specs["specs.zeroToSixty"] = float(accel_match.group(1))

    # Towing: "X,XXX pounds" near "tow"
    tow_match = re.search(r"tow.*?(\d[\d,]+)\s*(?:pound|lb)", full_text, re.IGNORECASE)
    if tow_match and "specs.towingCapacityLbs" not in specs:
        try:
            specs["specs.towingCapacityLbs"] = int(tow_match.group(1).replace(",", ""))
        except ValueError:
            pass

    logging.info(f"    Extracted {len(specs)} spec field(s) from C&D page")
    return specs


def merge_into_firestore_shape(vehicle_id: str, cnd_specs: dict, existing: dict) -> dict:
    """
    Merge C&D spec data into an existing Firestore document shape.
    Only fills fields that are None or missing -- never overwrites existing data.
    """
    result = {}

    for field, value in cnd_specs.items():
        if "." in field:
            # Nested field like "specs.range"
            parts = field.split(".", 1)
            top, sub = parts[0], parts[1]
            existing_sub = existing.get(top, {}).get(sub)
            if existing_sub is None or existing_sub == 0:
                if top not in result:
                    result[top] = dict(existing.get(top, {}))
                result[top][sub] = value
        else:
            # Top-level field like "msrpFrom"
            if existing.get(field) is None or existing.get(field) == 0:
                result[field] = value

    return result


async def fetch_cnd_specs(
    vehicle_id: str,
    url: str,
    client: httpx.AsyncClient,
) -> dict:
    """Fetch and parse a C&D specs page."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.caranddriver.com/",
    }

    try:
        resp = await client.get(url, headers=headers, timeout=20, follow_redirects=True)
        if resp.status_code == 404:
            logging.warning(f"  [{vehicle_id}] C&D 404 at {url}")
            return {}
        if resp.status_code != 200:
            logging.warning(f"  [{vehicle_id}] C&D returned {resp.status_code}")
            return {}

        soup = BeautifulSoup(resp.text, "lxml")
        return parse_specs_from_soup(soup, vehicle_id)

    except httpx.TimeoutException:
        logging.warning(f"  [{vehicle_id}] C&D request timed out")
        return {}
    except Exception as e:
        logging.warning(f"  [{vehicle_id}] C&D fetch error: {e}")
        return {}


async def run_caranddriver_scraper(
    vehicle_filter: Optional[str] = None,
    dry_run: bool = False,
):
    """
    Main entry point.
    Fetches C&D specs for all tracked vehicles (or a single vehicle)
    and merges missing fields into Firestore documents.
    """
    logging.info("\n" + "=" * 50)
    logging.info("  Car and Driver Specs Scraper")
    logging.info("=" * 50 + "\n")

    if vehicle_filter:
        queries = {vehicle_filter: VEHICLE_URLS[vehicle_filter]} if vehicle_filter in VEHICLE_URLS else {}
    else:
        queries = VEHICLE_URLS

    if not queries:
        logging.warning("No matching vehicles in VEHICLE_URLS")
        return

    if not dry_run:
        from firebase_client import FirebaseClient
        db_client = FirebaseClient()

    updated = 0
    skipped = 0

    async with httpx.AsyncClient() as client:
        for vehicle_id, url in queries.items():
            logging.info(f"  {vehicle_id}...")

            cnd_specs = await fetch_cnd_specs(vehicle_id, url, client)

            if not cnd_specs:
                logging.info(f"    No specs extracted")
                skipped += 1
                import asyncio as aio, random
                await aio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))
                continue

            if dry_run:
                logging.info(f"    DRY RUN -- would merge {len(cnd_specs)} field(s):")
                for k, v in cnd_specs.items():
                    logging.info(f"      {k}: {v}")
                updated += 1
                import asyncio as aio, random
                await aio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))
                continue

            # Fetch existing document to avoid overwriting good data
            doc_ref = db_client._db.collection("vehicles").document(vehicle_id)
            existing_doc = doc_ref.get()
            existing = existing_doc.to_dict() if existing_doc.exists else {}

            merged = merge_into_firestore_shape(vehicle_id, cnd_specs, existing)

            if merged:
                merged["specsLastUpdated"] = datetime.now(timezone.utc).isoformat()
                merged["specsSource"] = f"Car and Driver ({url})"
                doc_ref.set(merged, merge=True)
                logging.info(f"    Wrote {len(merged)} field(s) to Firestore")
                updated += 1
            else:
                logging.info(f"    All fields already populated -- skipped")
                skipped += 1

            import asyncio as aio, random
            await aio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))

    logging.info(
        f"\nDone -- {updated} updated, {skipped} skipped"
        + (" (DRY RUN)" if dry_run else "")
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense Car and Driver Specs Scraper")
    parser.add_argument("--vehicle", help="Single vehicle ID (e.g. ford-mustang-mach-e-2025)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(run_caranddriver_scraper(
        vehicle_filter=args.vehicle,
        dry_run=args.dry_run,
    ))
