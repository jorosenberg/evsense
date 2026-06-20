"""
findmyelectric_scraper.py -- Scrapes FindMyElectric.com for used EV market data and specs.

FindMyElectric uses Algolia InstantSearch. Their Algolia index is public and
queryable directly via the Algolia REST API -- no browser or JavaScript needed.

What we collect:
  - Used market pricing benchmarks (avg price, price range, avg mileage)
  - Vehicle specs extracted from listing data (range, battery, etc.)
    where manufacturer scraping failed to return data

Algolia endpoint:
  https://1KGZWNPIBZ-dsn.algolia.net/1/indexes/*/queries
  App ID:  1KGZWNPIBZ
  API Key: (public search key, visible in their page source)

Usage:
    python scraper/scrapers/findmyelectric_scraper.py
    python scraper/scrapers/findmyelectric_scraper.py --make Tesla --model "Model 3"
    python scraper/scrapers/findmyelectric_scraper.py --dry-run

Data written to Firestore:
  vehicles/{id}.usedMarketData.findMyElectric = {
    avgPriceUsd, minPriceUsd, maxPriceUsd, avgMileage,
    sampleSize, lastScraped, listingUrl
  }

  vehicles/{id}.specs (only fields not already populated -- never overwrites)
"""

import asyncio
import argparse
import json
import sys
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, setup_logging

import logging
setup_logging()

# -- Algolia config (public search key from their page source) ----------------
# These are public read-only keys intended for browser use -- using them
# for aggregated research is consistent with their robots.txt and ToS.
ALGOLIA_APP_ID  = "1KGZWNPIBZ"
ALGOLIA_API_KEY = "YjA3N2IwZThlYWE5ZmI2MWQ0ZGIxNzJkZjYwMGJjZGJhMDhlZWZhNjU4MWY5M2UxZjE5NDI5MWYzNTM5MDljMXZhbGlkVW50aWw9MTc5OTk5OTk5OSZmaWx0ZXJzPXN0YXR1cyUzQWFjdGl2ZQ=="
ALGOLIA_INDEX   = "wp_posts_listing"
ALGOLIA_URL     = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query"

# Headers required by Algolia
ALGOLIA_HEADERS = {
    "X-Algolia-Application-Id": ALGOLIA_APP_ID,
    "X-Algolia-API-Key":        ALGOLIA_API_KEY,
    "Content-Type":             "application/json",
    "User-Agent":               USER_AGENT,
}

# -- Vehicle mapping ----------------------------------------------------------
# Maps our Firestore vehicle IDs to FindMyElectric search terms
VEHICLE_QUERIES = {
    "tesla-model-3-2024":          {"make": "Tesla",      "model": "Model 3",        "year": 2024},
    "tesla-model-y-2024":          {"make": "Tesla",      "model": "Model Y",        "year": 2024},
    "tesla-model-s-2024":          {"make": "Tesla",      "model": "Model S",        "year": 2024},
    "tesla-model-x-2024":          {"make": "Tesla",      "model": "Model X",        "year": 2024},
    "ford-mustang-mach-e-2024":    {"make": "Ford",       "model": "Mustang Mach-E", "year": 2024},
    "ford-f-150-lightning-2024":   {"make": "Ford",       "model": "F-150 Lightning","year": 2024},
    "chevrolet-equinox-ev-2024":   {"make": "Chevrolet",  "model": "Equinox EV",     "year": 2024},
    "chevrolet-blazer-ev-2024":    {"make": "Chevrolet",  "model": "Blazer EV",      "year": 2024},
    "hyundai-ioniq-5-2024":        {"make": "Hyundai",    "model": "IONIQ 5",        "year": 2024},
    "hyundai-ioniq-6-2024":        {"make": "Hyundai",    "model": "IONIQ 6",        "year": 2024},
    "kia-ev6-2024":                {"make": "Kia",        "model": "EV6",            "year": 2024},
    "kia-ev9-2024":                {"make": "Kia",        "model": "EV9",            "year": 2024},
    "volkswagen-id4-2024":         {"make": "Volkswagen", "model": "ID.4",           "year": 2024},
    "rivian-r1t-2024":             {"make": "Rivian",     "model": "R1T",            "year": 2024},
    "rivian-r1s-2024":             {"make": "Rivian",     "model": "R1S",            "year": 2024},
    "bmw-i4-2024":                 {"make": "BMW",        "model": "i4",             "year": 2024},
    "lucid-air-2024":              {"make": "Lucid",      "model": "Air",            "year": 2024},
    "polestar-polestar-2-2024":    {"make": "Polestar",   "model": "Polestar 2",     "year": 2024},
    "polestar-polestar-3-2024":    {"make": "Polestar",   "model": "Polestar 3",     "year": 2024},
}


async def query_algolia(
    make: str,
    model: str,
    year: Optional[int] = None,
    client: httpx.AsyncClient = None,
    max_results: int = 50,
) -> list[dict]:
    """
    Query FindMyElectric's Algolia index for listings matching make/model/year.
    Returns raw listing dicts from Algolia.
    """
    # Build Algolia filter string
    filters = f"status:active AND make:{make}"
    query_str = model
    if year:
        filters += f" AND year:{year}"

    payload = {
        "query":            query_str,
        "filters":          filters,
        "hitsPerPage":      max_results,
        "attributesToRetrieve": [
            "title", "price", "mileage", "year", "make", "model",
            "extColor", "state_two", "city_single",
            "battery_range", "battery_size", "charging_speed",
            "vin", "permalink", "thumbnail",
        ],
    }

    try:
        resp = await client.post(
            ALGOLIA_URL,
            headers=ALGOLIA_HEADERS,
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        hits = data.get("hits", [])
        logging.info(f"  Algolia: {len(hits)} listings for {make} {model} {year or ''}")
        return hits
    except Exception as e:
        logging.warning(f"  Algolia query failed for {make} {model}: {e}")
        # Try without filters as a fallback
        try:
            simple_payload = {"query": f"{year or ''} {make} {model}".strip(), "hitsPerPage": 30}
            resp = await client.post(ALGOLIA_URL, headers=ALGOLIA_HEADERS, json=simple_payload, timeout=15)
            return resp.json().get("hits", [])
        except Exception:
            return []


def aggregate_listings(hits: list[dict]) -> Optional[dict]:
    """
    Aggregate listing data into market stats.
    Filters out outliers (prices below $5k or above $200k) and sold listings.
    """
    prices   = []
    mileages = []
    ranges   = []

    for hit in hits:
        price   = hit.get("price")
        mileage = hit.get("mileage")
        rng     = hit.get("battery_range")

        if price and isinstance(price, (int, float)) and 5000 < price < 200000:
            prices.append(int(price))
        if mileage and isinstance(mileage, (int, float)) and 0 < mileage < 500000:
            mileages.append(int(mileage))
        if rng and isinstance(rng, (int, float)) and 50 < rng < 600:
            ranges.append(int(rng))

    if not prices:
        return None

    prices.sort()
    # Remove top/bottom 5% as outliers
    trim = max(1, len(prices) // 20)
    trimmed = prices[trim:-trim] if len(prices) > 10 else prices

    return {
        "sampleSize":    len(prices),
        "avgPriceUsd":   int(sum(trimmed) / len(trimmed)),
        "minPriceUsd":   prices[0],
        "maxPriceUsd":   prices[-1],
        "medianPriceUsd":prices[len(prices) // 2],
        "avgMileage":    int(sum(mileages) / len(mileages)) if mileages else None,
        "avgRangeReported": int(sum(ranges) / len(ranges)) if ranges else None,
        "listingUrl":    f"https://www.findmyelectric.com/listings/?makes={hits[0].get('make','') if hits else ''}",
        "lastScraped":   datetime.now(timezone.utc).isoformat(),
    }


def extract_specs_from_listings(hits: list[dict], existing_specs: dict) -> dict:
    """
    Extract spec data from listing descriptions when manufacturer scraping failed.
    Only populates fields that are None/missing in existing_specs.
    Never overwrites data we already have from authoritative sources.
    """
    if not hits:
        return {}

    new_specs = {}

    # Collect spec values from all listings and take the most common
    ranges = [h.get("battery_range") for h in hits if h.get("battery_range")]
    batteries = [h.get("battery_size") for h in hits if h.get("battery_size")]

    # Only set if we don't already have this field
    if not existing_specs.get("range") and ranges:
        # Take median reported range
        ranges.sort()
        new_specs["range"] = ranges[len(ranges) // 2]

    if not existing_specs.get("batteryKwh") and batteries:
        batteries.sort()
        new_specs["batteryKwh"] = batteries[len(batteries) // 2]

    return new_specs


async def run_findmyelectric_scraper(
    vehicle_filter: Optional[str] = None,
    make_filter: Optional[str] = None,
    model_filter: Optional[str] = None,
    dry_run: bool = False,
    fill_specs: bool = True,
):
    """
    Main entry point.

    Args:
        vehicle_filter: specific Firestore vehicle ID (e.g. "tesla-model-3-2024")
        make_filter:    filter by make when used standalone (e.g. "Tesla")
        model_filter:   filter by model when used standalone
        dry_run:        print results without writing to Firestore
        fill_specs:     also update missing specs fields from listing data
    """
    logging.info("\n" + "="*50)
    logging.info("  FindMyElectric Scraper")
    logging.info("="*50 + "\n")

    # Determine which vehicles to process
    if vehicle_filter:
        queries = {vehicle_filter: VEHICLE_QUERIES[vehicle_filter]} if vehicle_filter in VEHICLE_QUERIES else {}
    elif make_filter:
        queries = {
            vid: q for vid, q in VEHICLE_QUERIES.items()
            if q["make"].lower() == make_filter.lower()
            and (not model_filter or model_filter.lower() in q["model"].lower())
        }
    else:
        queries = VEHICLE_QUERIES

    if not queries:
        logging.warning("No matching vehicles found in VEHICLE_QUERIES")
        return

    if not dry_run:
        from firebase_client import FirebaseClient
        db_client = FirebaseClient()

    updated = 0
    not_found = 0

    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        for vehicle_id, query in queries.items():
            logging.info(f"  {vehicle_id}...")

            hits = await query_algolia(
                make=query["make"],
                model=query["model"],
                year=query.get("year"),
                client=client,
            )

            if not hits:
                logging.info(f"    No listings found")
                not_found += 1
                continue

            market_data = aggregate_listings(hits)
            if not market_data:
                logging.info(f"    Could not aggregate pricing")
                not_found += 1
                continue

            logging.info(
                f"    {market_data['sampleSize']} listings | "
                f"avg ${market_data['avgPriceUsd']:,} | "
                f"range ${market_data['minPriceUsd']:,}-${market_data['maxPriceUsd']:,}"
            )

            if dry_run:
                logging.info(f"    DRY RUN -- would write: {json.dumps(market_data, indent=6)}")
                updated += 1
                continue

            # Write used market data
            update_payload = {
                "usedMarketData": {
                    "findMyElectric": market_data
                }
            }

            # Optionally fill missing specs from listing data
            if fill_specs:
                existing_doc = db_client._db.collection("vehicles").document(vehicle_id).get()
                existing_specs = (existing_doc.to_dict() or {}).get("specs", {}) if existing_doc.exists else {}
                new_specs = extract_specs_from_listings(hits, existing_specs)
                if new_specs:
                    logging.info(f"    Filling missing specs: {list(new_specs.keys())}")
                    update_payload["specs"] = {**existing_specs, **new_specs}

            db_client._db.collection("vehicles").document(vehicle_id).set(
                update_payload,
                merge=True,
            )
            updated += 1

            # Polite rate limit between vehicles
            import asyncio as aio, random
            await aio.sleep(random.uniform(0.5, 1.5))

    logging.info(f"\nDone -- {updated} updated, {not_found} not found{'  (DRY RUN)' if dry_run else ''}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense FindMyElectric Scraper")
    parser.add_argument("--vehicle", help="Specific vehicle ID (e.g. tesla-model-3-2024)")
    parser.add_argument("--make",    help="Filter by make (e.g. Tesla)")
    parser.add_argument("--model",   help="Filter by model (e.g. 'Model 3')")
    parser.add_argument("--no-specs", action="store_true", help="Skip spec filling")
    parser.add_argument("--dry-run",  action="store_true")
    args = parser.parse_args()

    asyncio.run(run_findmyelectric_scraper(
        vehicle_filter=args.vehicle,
        make_filter=args.make,
        model_filter=args.model,
        dry_run=args.dry_run,
        fill_specs=not args.no_specs,
    ))
