"""
recharged_scraper.py — Scrapes used EV market data from Recharged.com

Recharged is a used EV dealer based in Richmond, VA with ~200+ listings.
They're notable for publishing a "Recharged Score" which includes battery health
assessment — rare transparency in the used EV market.

Data collected per listing:
  - Year, make, model, trim
  - Asking price
  - Mileage
  - Recharged Score (battery health + vehicle history composite)
  - Battery health percentage (where available)
  - Exterior color
  - Location / availability

This data is aggregated (never individual VINs) and stored as used market
pricing benchmarks in Firestore at:
  usedMarketData/{make}-{model}-{year} → {
    avgPriceDollars, minPriceDollars, maxPriceDollars,
    avgMileage, sampleSize, avgBatteryHealth, lastScraped
  }

Used for:
  - Populating the "Used" filter on the Browse page
  - Informing depreciation projections
  - Showing "What used buyers are actually paying" on vehicle detail pages

Note: Recharged.com uses Next.js — vehicle data is embedded in __NEXT_DATA__
as JSON, making extraction straightforward without JavaScript rendering.

Usage:
  python scraper/scrapers/recharged_scraper.py
  python scraper/scrapers/recharged_scraper.py --dry-run
  python scraper/scrapers/recharged_scraper.py --pages 5
"""

import asyncio
import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S, setup_logging

import logging
setup_logging()

RECHARGED_BASE = "https://recharged.com"
RECHARGED_VEHICLES_URL = f"{RECHARGED_BASE}/vehicles"

# Recharged's Next.js API endpoint for vehicle listings
RECHARGED_API = f"{RECHARGED_BASE}/api/vehicles"


async def fetch_all_listings(client: httpx.AsyncClient, max_pages: int = 20) -> list[dict]:
    """
    Fetch all vehicle listings from Recharged.com.

    Recharged uses Next.js with server-side rendering. The full vehicle list
    is embedded in __NEXT_DATA__ on the /vehicles page, or accessible via
    their internal API endpoint.
    """
    all_listings = []

    # Method 1: Try the API endpoint directly (faster if available)
    try:
        resp = await client.get(RECHARGED_API, params={"limit": 500, "status": "available"}, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            vehicles = data.get("vehicles", data.get("data", data if isinstance(data, list) else []))
            if vehicles:
                logging.info(f"  API: found {len(vehicles)} listings")
                return vehicles
    except Exception:
        pass

    # Method 2: Parse __NEXT_DATA__ from the listings page (reliable fallback)
    page = 1
    while page <= max_pages:
        try:
            url = RECHARGED_VEHICLES_URL if page == 1 else f"{RECHARGED_VEHICLES_URL}?page={page}"
            resp = await client.get(url, timeout=20)
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, "lxml")
            next_data_el = soup.find("script", {"id": "__NEXT_DATA__"})

            if not next_data_el:
                logging.warning(f"  No __NEXT_DATA__ found on page {page}")
                break

            next_data = json.loads(next_data_el.string)

            # Navigate the Next.js page props structure
            page_props = (
                next_data
                .get("props", {})
                .get("pageProps", {})
            )

            # Try common keys for vehicle listings data
            vehicles_on_page = (
                page_props.get("vehicles")
                or page_props.get("listings")
                or page_props.get("inventory")
                or page_props.get("data", {}).get("vehicles")
                or []
            )

            if not vehicles_on_page:
                # Try to find vehicle data anywhere in pageProps
                for key, value in page_props.items():
                    if isinstance(value, list) and len(value) > 0:
                        if isinstance(value[0], dict) and any(
                            k in value[0] for k in ["price", "make", "year", "mileage", "vin"]
                        ):
                            vehicles_on_page = value
                            break

            if not vehicles_on_page:
                logging.info(f"  No vehicles found on page {page} — stopping pagination")
                break

            all_listings.extend(vehicles_on_page)
            logging.info(f"  Page {page}: {len(vehicles_on_page)} listings (total: {len(all_listings)})")

            # Check if there are more pages
            pagination = page_props.get("pagination", page_props.get("meta", {}))
            total_pages = pagination.get("totalPages", pagination.get("total_pages", 1))
            if page >= total_pages:
                break

            page += 1
            import random
            await asyncio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))

        except Exception as e:
            logging.warning(f"  Page {page} failed: {e}")
            break

    logging.info(f"  Total listings fetched: {len(all_listings)}")
    return all_listings


def normalize_listing(raw: dict) -> dict | None:
    """
    Normalize a raw Recharged listing to a consistent schema.
    Handles variations in field names across API versions.
    """
    def get(*keys):
        for k in keys:
            v = raw.get(k)
            if v is not None:
                return v
        return None

    year = get("year", "modelYear", "model_year")
    make = get("make", "manufacturer", "brand")
    model = get("model", "modelName", "model_name")
    trim = get("trim", "trimLevel", "trim_level", "variant")
    price = get("price", "askingPrice", "asking_price", "listPrice", "list_price")
    mileage = get("mileage", "miles", "odometer")
    color = get("color", "exteriorColor", "exterior_color")

    # Recharged Score is their proprietary composite score
    score = get("rechargedScore", "recharged_score", "score", "rating")

    # Battery health — sometimes separate from composite score
    battery_health = get("batteryHealth", "battery_health", "batteryHealthPercent", "soh")

    # VIN (we don't store individual VINs — just for deduplication)
    vin = get("vin", "VIN")

    if not all([year, make, model, price]):
        return None

    # Sanitize numeric fields
    try:
        year = int(year)
        price = int(float(str(price).replace("$", "").replace(",", "")))
        mileage = int(float(str(mileage).replace(",", ""))) if mileage else None
        score = float(score) if score else None
        battery_health = float(str(battery_health).replace("%", "")) if battery_health else None
    except (ValueError, TypeError):
        return None

    # Sanity checks
    if not (2018 <= year <= datetime.now().year + 1):
        return None
    if not (5000 <= price <= 200000):
        return None

    return {
        "year": year,
        "make": str(make).title(),
        "model": str(model),
        "trim": trim,
        "price": price,
        "mileage": mileage,
        "color": color,
        "rechargedScore": score,
        "batteryHealthPercent": battery_health,
        "_vin_hash": hash(vin) if vin else None,  # For dedup — never store raw VIN
    }


def aggregate_market_data(listings: list[dict]) -> dict:
    """
    Aggregate individual listings into market pricing benchmarks by make/model/year.

    Returns: {
      "tesla-model-3-2022": {
        avgPrice, minPrice, maxPrice, avgMileage, sampleSize, avgBatteryHealth
      }, ...
    }
    """
    grouped = defaultdict(list)

    for listing in listings:
        key = f"{listing['make'].lower()}-{listing['model'].lower().replace(' ', '-')}-{listing['year']}"
        grouped[key].append(listing)

    aggregated = {}

    for key, group in grouped.items():
        prices = [l["price"] for l in group if l["price"]]
        mileages = [l["mileage"] for l in group if l["mileage"]]
        battery_healths = [l["batteryHealthPercent"] for l in group if l["batteryHealthPercent"]]
        scores = [l["rechargedScore"] for l in group if l["rechargedScore"]]

        if not prices:
            continue

        aggregated[key] = {
            "make": group[0]["make"],
            "model": group[0]["model"],
            "year": group[0]["year"],
            "sampleSize": len(group),
            "avgPriceDollars": round(sum(prices) / len(prices)),
            "medianPriceDollars": sorted(prices)[len(prices) // 2],
            "minPriceDollars": min(prices),
            "maxPriceDollars": max(prices),
            "avgMileage": round(sum(mileages) / len(mileages)) if mileages else None,
            "avgBatteryHealthPercent": round(sum(battery_healths) / len(battery_healths), 1) if battery_healths else None,
            "avgRechargedScore": round(sum(scores) / len(scores), 1) if scores else None,
            "sourceUrl": "https://recharged.com/vehicles",
            "lastScraped": datetime.now(timezone.utc).isoformat(),
        }

    return aggregated


async def run_recharged_scraper(max_pages: int = 20, dry_run: bool = False) -> dict:
    """Main entry point."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }

    logging.info("Scraping Recharged.com used EV listings...")

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        raw_listings = await fetch_all_listings(client, max_pages=max_pages)

    # Normalize all listings
    normalized = []
    for raw in raw_listings:
        listing = normalize_listing(raw)
        if listing:
            normalized.append(listing)

    logging.info(f"  Normalized: {len(normalized)} valid listings out of {len(raw_listings)}")

    # Aggregate into market benchmarks
    market_data = aggregate_market_data(normalized)
    logging.info(f"  Aggregated: {len(market_data)} make/model/year combinations")

    if dry_run:
        logging.info("\n[DRY RUN] Market data summary:")
        for key, data in sorted(market_data.items())[:10]:
            logging.info(
                f"  {data['year']} {data['make']} {data['model']}: "
                f"avg ${data['avgPriceDollars']:,} "
                f"(n={data['sampleSize']}, "
                f"battery={data.get('avgBatteryHealthPercent', 'N/A')}%)"
            )
        if len(market_data) > 10:
            logging.info(f"  ... and {len(market_data) - 10} more")
    else:
        # Write to Firestore usedMarketData collection
        from firebase_client import FirebaseClient
        fb = FirebaseClient()

        for key, data in market_data.items():
            fb._db.collection("usedMarketData").document(key).set(data, merge=True)

        logging.info(f"  ✓ Wrote {len(market_data)} records to Firestore usedMarketData")

        # Also update matching vehicles in the main vehicles collection with used pricing context
        for key, data in market_data.items():
            # Try to find our Firestore vehicle doc for this make/model
            # Convention: look for {make}-{model}-{current_year} or similar
            vehicle_id = f"{data['make'].lower()}-{data['model'].lower().replace(' ', '-')}-2024"
            fb._db.collection("vehicles").document(vehicle_id).set(
                {
                    "usedMarketData": {
                        "recharged": {
                            data["year"]: {
                                "avgPrice": data["avgPriceDollars"],
                                "minPrice": data["minPriceDollars"],
                                "sampleSize": data["sampleSize"],
                                "avgBatteryHealth": data.get("avgBatteryHealthPercent"),
                                "lastScraped": data["lastScraped"],
                            }
                        }
                    }
                },
                merge=True,
            )

    logging.info(f"\nRecharged.com scrape complete — {len(market_data)} market benchmarks")
    return market_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense Recharged.com Scraper")
    parser.add_argument("--pages", type=int, default=20, help="Max pages to fetch")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(run_recharged_scraper(
        max_pages=args.pages,
        dry_run=args.dry_run,
    ))
