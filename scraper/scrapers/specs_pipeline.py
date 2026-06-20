"""
specs_pipeline.py -- Shared specs-fetching pipeline used by all brand scrapers.

Priority order:
  1. Car and Driver specs page (SSR, no browser needed, most reliable)
  2. Manufacturer website (Playwright, falls back to httpx)
  3. Curated static data (always available)

This module provides get_specs(vehicle_id, make, model, year) which returns
a fully-populated specs dict using the highest-priority source that works.
"""

import re
import json
import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# -- C&D URL map --------------------------------------------------------------
# Short-form URLs -- C&D redirects to current model year automatically.
CARANDDRIVER_URLS: dict[str, str] = {
    "tesla-model-3-2025":           "https://www.caranddriver.com/tesla/model-3/specs",
    "tesla-model-y-2025":           "https://www.caranddriver.com/tesla/model-y/specs",
    "tesla-model-s-2025":           "https://www.caranddriver.com/tesla/model-s/specs",
    "tesla-model-x-2025":           "https://www.caranddriver.com/tesla/model-x/specs",
    "tesla-cybertruck-2025":        "https://www.caranddriver.com/tesla/cybertruck/specs",
    "ford-mustang-mach-e-2025":     "https://www.caranddriver.com/ford/mustang-mach-e/specs",
    "ford-f-150-lightning-2025":    "https://www.caranddriver.com/ford/f-150-lightning/specs",
    "chevrolet-equinox-ev-2025":    "https://www.caranddriver.com/chevrolet/equinox-ev/specs",
    "chevrolet-blazer-ev-2025":     "https://www.caranddriver.com/chevrolet/blazer-ev/specs",
    "chevrolet-silverado-ev-2025":  "https://www.caranddriver.com/chevrolet/silverado-ev/specs",
    "hyundai-ioniq-5-2025":         "https://www.caranddriver.com/hyundai/ioniq-5/specs",
    "hyundai-ioniq-6-2025":         "https://www.caranddriver.com/hyundai/ioniq-6/specs",
    "hyundai-ioniq-9-2025":         "https://www.caranddriver.com/hyundai/ioniq-9/specs",
    "kia-ev6-2025":                 "https://www.caranddriver.com/kia/ev6/specs",
    "kia-ev9-2025":                 "https://www.caranddriver.com/kia/ev9/specs",
    "volkswagen-id4-2025":          "https://www.caranddriver.com/volkswagen/id4/specs",
    "rivian-r1t-2025":              "https://www.caranddriver.com/rivian/r1t/specs",
    "rivian-r1s-2025":              "https://www.caranddriver.com/rivian/r1s/specs",
    "bmw-i4-2025":                  "https://www.caranddriver.com/bmw/i4/specs",
    "bmw-ix-2025":                  "https://www.caranddriver.com/bmw/ix/specs",
    "bmw-i5-2025":                  "https://www.caranddriver.com/bmw/i5/specs",
    "bmw-i7-2025":                  "https://www.caranddriver.com/bmw/i7/specs",
    "lucid-air-2025":               "https://www.caranddriver.com/lucid/air/specs",
    "polestar-polestar-2-2025":     "https://www.caranddriver.com/polestar/polestar-2/specs",
    "polestar-polestar-3-2025":     "https://www.caranddriver.com/polestar/polestar-3/specs",
    "polestar-polestar-4-2025":     "https://www.caranddriver.com/polestar/polestar-4/specs",
}

# -- C&D spec label -> Firestore field mapping --------------------------------
SPEC_MAP = {
    "horsepower":               ("horsepower",              int),
    "0-60 mph":                 ("zeroToSixty",             float),
    "zero to 60":               ("zeroToSixty",             float),
    "top speed":                ("topSpeed",                int),
    "torque":                   ("torqueLbFt",              int),
    "epa range":                ("range",                   int),
    "battery":                  ("batteryKwh",              float),
    "dc fast":                  ("chargingSpeedDcFastKw",   int),
    "onboard charger":          ("chargingSpeedL2Kw",       float),
    "level 2":                  ("chargingSpeedL2Kw",       float),
    "seating":                  ("seatingCapacity",         int),
    "cargo volume":             ("cargoVolumeCuFt",         float),
    "front trunk":              ("frunkVolumeCuFt",         float),
    "towing":                   ("towingCapacityLbs",       int),
    "curb weight":              ("weightLbs",               int),
    "ground clearance":         ("groundClearanceIn",       float),
    "base price":               ("_msrpFrom",               int),   # special handling
}


def _parse_number(text: str) -> Optional[float]:
    text = text.replace(",", "").replace("$", "")
    m = re.search(r"(\d+\.?\d*)", text)
    return float(m.group(1)) if m else None


async def fetch_caranddriver_specs(vehicle_id: str) -> dict:
    """
    Fetch specs from Car and Driver. Returns a specs dict or {} if failed.
    C&D is SSR so plain httpx works -- no browser needed.
    """
    url = CARANDDRIVER_URLS.get(vehicle_id)
    if not url:
        return {}

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        logger.warning("beautifulsoup4 not installed -- skipping C&D scrape")
        return {}

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.caranddriver.com/",
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                logger.debug(f"C&D 404 for {vehicle_id}")
                return {}
            if resp.status_code != 200:
                logger.debug(f"C&D {resp.status_code} for {vehicle_id}")
                return {}
            html = resp.text
    except Exception as e:
        logger.debug(f"C&D fetch failed for {vehicle_id}: {e}")
        return {}

    soup = BeautifulSoup(html, "lxml")
    specs: dict = {}

    # Strategy 1: JSON-LD schema.org
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if not isinstance(data, dict):
                continue
            if "Car" in str(data.get("@type", "")):
                if data.get("offers", {}).get("price"):
                    try:
                        specs["_msrpFrom"] = int(float(str(data["offers"]["price"]).replace(",", "")))
                    except (ValueError, TypeError):
                        pass
        except Exception:
            pass

    # Strategy 2: spec tables
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            label = cells[0].get_text(strip=True).lower()
            value = cells[-1].get_text(strip=True)
            for key, (field, cast) in SPEC_MAP.items():
                if key in label:
                    num = _parse_number(value)
                    if num is not None:
                        try:
                            specs[field] = cast(num)
                        except (ValueError, TypeError):
                            pass
                    break

    # Strategy 3: dl/dt/dd definition lists
    for dl in soup.find_all("dl"):
        for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
            label = dt.get_text(strip=True).lower()
            value = dd.get_text(strip=True)
            for key, (field, cast) in SPEC_MAP.items():
                if key in label:
                    num = _parse_number(value)
                    if num is not None:
                        try:
                            specs[field] = cast(num)
                        except (ValueError, TypeError):
                            pass
                    break

    # Strategy 4: text patterns for range and 0-60
    text = soup.get_text()
    if "range" not in specs:
        m = re.search(r"(\d{2,3})\s*(?:miles?|mi)\s*(?:EPA|range)", text, re.IGNORECASE)
        if m:
            specs["range"] = int(m.group(1))
    if "zeroToSixty" not in specs:
        m = re.search(r"0.to.60.*?(\d+\.\d+)\s*sec", text, re.IGNORECASE)
        if m:
            specs["zeroToSixty"] = float(m.group(1))

    if specs:
        logger.info(f"  C&D: {len(specs)} spec field(s) for {vehicle_id}")
        specs["_source"] = f"caranddriver ({url})"
    return specs


def merge_specs(base: dict, override: dict) -> dict:
    """Merge two spec dicts. override only fills missing fields in base."""
    result = dict(base)
    for k, v in override.items():
        if k.startswith('_'):
            continue  # skip internal fields
        if result.get(k) is None or result.get(k) == 0:
            result[k] = v
    return result


async def get_specs_with_fallback(
    vehicle_id: str,
    manufacturer_specs: dict,
    curated_specs: dict,
) -> tuple[dict, str]:
    """
    Get the best available specs dict using the priority pipeline:
      1. Car and Driver (fills missing fields onto manufacturer data)
      2. Manufacturer page data (passed in)
      3. Curated static data

    Returns (specs_dict, source_description).
    """
    # Start with manufacturer data as base
    specs = dict(manufacturer_specs)
    source = "manufacturer"

    # Fill gaps from C&D
    cnd = await fetch_caranddriver_specs(vehicle_id)
    if cnd:
        before = sum(1 for v in specs.values() if v)
        specs = merge_specs(specs, cnd)
        after = sum(1 for v in specs.values() if v)
        if after > before:
            source = "caranddriver+manufacturer"

    # Fill remaining gaps from curated
    if curated_specs:
        before = sum(1 for v in specs.values() if v)
        specs = merge_specs(specs, curated_specs)
        after = sum(1 for v in specs.values() if v)
        if after > before and source == "manufacturer":
            source = "curated"
        elif after > before:
            source += "+curated"

    # Extract internal fields
    msrp_from_cnd = specs.pop("_msrpFrom", None)
    specs.pop("_source", None)

    return specs, source, msrp_from_cnd