"""
maintenance_scraper.py — Scrapes RepairPal for EV maintenance cost estimates.

RepairPal aggregates real repair shop invoices and provides annual maintenance
cost estimates by make/model/year. This data populates the `maintenance` field
on each vehicle Firestore document.

Source: https://repairpal.com/reliability/
Method: httpx + BeautifulSoup (no Playwright needed — RepairPal is SSR)

Usage:
    python scraper/processors/maintenance_scraper.py
    python scraper/processors/maintenance_scraper.py --vehicle tesla-model-3-2024
    python scraper/processors/maintenance_scraper.py --dry-run

Rate limit: RepairPal is lenient — 1.5–3s delays between requests is sufficient.
"""

import asyncio
import argparse
import sys
import re
from pathlib import Path
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S, setup_logging, DRY_RUN

import logging
setup_logging()

# RepairPal URL pattern: /reliability/{make}/{model}
REPAIRPAL_BASE = 'https://repairpal.com/reliability'

# Mapping from Firestore vehicle data to RepairPal URL slugs
# RepairPal uses lowercase hyphenated make/model names
REPAIRPAL_SLUGS = {
    'tesla-model-3-2024':        ('tesla', 'model-3'),
    'tesla-model-y-2024':        ('tesla', 'model-y'),
    'tesla-model-s-2024':        ('tesla', 'model-s'),
    'tesla-model-x-2024':        ('tesla', 'model-x'),
    'ford-mustang-mach-e-2024':  ('ford', 'mustang-mach-e'),
    'ford-f-150-lightning-2024': ('ford', 'f-150-lightning'),
    'chevrolet-equinox-ev-2024': ('chevrolet', 'equinox-ev'),
    'chevrolet-blazer-ev-2024':  ('chevrolet', 'blazer-ev'),
    'hyundai-ioniq-5-2024':      ('hyundai', 'ioniq-5'),
    'hyundai-ioniq-6-2024':      ('hyundai', 'ioniq-6'),
    'kia-ev6-2024':              ('kia', 'ev6'),
    'kia-ev9-2024':              ('kia', 'ev9'),
    'volkswagen-id4-2024':       ('volkswagen', 'id4'),
    'rivian-r1t-2024':           ('rivian', 'r1t'),
    'rivian-r1s-2024':           ('rivian', 'r1s'),
    'bmw-i4-2024':               ('bmw', 'i4'),
    'lucid-air-2024':            ('lucid', 'air'),
    'polestar-polestar-2-2024':  ('polestar', 'polestar-2'),
}

# EV-specific maintenance note (used when RepairPal doesn't have EV data yet)
EV_MAINTENANCE_NOTE = (
    'EVs eliminate oil changes and have lower brake wear due to regenerative braking. '
    'Primary maintenance: tire rotation, cabin air filter, coolant flush (every 5 years), '
    'wiper blades, and annual safety inspection.'
)

# Default fallback annual cost when RepairPal has no data
DEFAULT_EV_ANNUAL_COST = 550  # EVs average ~50% less than ICE vehicles


async def scrape_repairpal(make_slug: str, model_slug: str, client: httpx.AsyncClient) -> dict | None:
    """
    Scrape maintenance cost estimate from RepairPal for a specific make/model.
    Returns dict with averageAnnualCostUsd and sourceUrl, or None if not found.
    """
    url = f'{REPAIRPAL_BASE}/{make_slug}/{model_slug}'

    try:
        resp = await client.get(url, timeout=15)
        if resp.status_code == 404:
            logging.warning(f'  RepairPal 404 for {url}')
            return None
        resp.raise_for_status()
    except Exception as e:
        logging.error(f'  RepairPal request failed for {url}: {e}')
        return None

    soup = BeautifulSoup(resp.text, 'lxml')

    # RepairPal embeds the average annual cost in a structured element.
    # Look for the cost figure — it appears in various formats across their pages.
    cost = None

    # Method 1: Look for the reliability score section with annual cost
    cost_elements = soup.find_all(string=re.compile(r'\$[\d,]+\s*per year', re.IGNORECASE))
    for el in cost_elements:
        match = re.search(r'\$([0-9,]+)', el)
        if match:
            cost = int(match.group(1).replace(',', ''))
            break

    # Method 2: Look for JSON-LD structured data
    if not cost:
        scripts = soup.find_all('script', type='application/ld+json')
        for script in scripts:
            try:
                import json
                data = json.loads(script.string or '')
                if isinstance(data, dict) and data.get('maintenanceCost'):
                    cost = int(data['maintenanceCost'])
                    break
            except Exception:
                pass

    # Method 3: Look for any dollar amount in the reliability section
    if not cost:
        reliability_section = soup.find(class_=re.compile(r'reliability|maintenance', re.IGNORECASE))
        if reliability_section:
            match = re.search(r'\$([0-9,]+)', reliability_section.get_text())
            if match:
                amount = int(match.group(1).replace(',', ''))
                # Sanity check: EV maintenance is typically $200–$1,500/year
                if 200 <= amount <= 1500:
                    cost = amount

    if cost:
        logging.info(f'  RepairPal: ${cost}/year for {make_slug}/{model_slug}')
        return {
            'averageAnnualCostUsd': cost,
            'sourceUrl': url,
            'notes': EV_MAINTENANCE_NOTE,
            'lastScraped': datetime.now(timezone.utc).isoformat(),
        }

    logging.warning(f'  Could not parse cost from {url}')
    return None


async def run_maintenance_scraper(vehicle_filter: str = None, dry_run: bool = False):
    """Scrape RepairPal maintenance data for all tracked vehicles."""

    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    from firebase_client import FirebaseClient
    db_client = FirebaseClient()

    vehicles_to_process = (
        [(vehicle_filter, REPAIRPAL_SLUGS.get(vehicle_filter))]
        if vehicle_filter
        else list(REPAIRPAL_SLUGS.items())
    )

    updated = 0
    used_fallback = 0
    failed = 0

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        for vehicle_id, slugs in vehicles_to_process:
            if not slugs:
                logging.warning(f'[{vehicle_id}] No RepairPal slug mapping — skipping')
                continue

            make_slug, model_slug = slugs
            logging.info(f'Scraping RepairPal for {vehicle_id}…')

            data = await scrape_repairpal(make_slug, model_slug, client)

            if not data:
                # Use a sensible EV default so the calculator always has something
                data = {
                    'averageAnnualCostUsd': DEFAULT_EV_ANNUAL_COST,
                    'sourceUrl': f'{REPAIRPAL_BASE}/{make_slug}',
                    'notes': EV_MAINTENANCE_NOTE + ' (Cost estimate — RepairPal data unavailable for this model.)',
                    'lastScraped': datetime.now(timezone.utc).isoformat(),
                }
                used_fallback += 1
                logging.info(f'  [{vehicle_id}] Using EV default: ${DEFAULT_EV_ANNUAL_COST}/yr')

            if dry_run:
                logging.info(f'  DRY RUN — would write: {data}')
            else:
                await db_client._db.collection('vehicles').document(vehicle_id).set(
                    {'maintenance': data}, merge=True
                )
                updated += 1

            import random
            await asyncio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))

    logging.info(f'\nDone — {updated} updated, {used_fallback} used fallback, {failed} failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='EVsense Maintenance Scraper')
    parser.add_argument('--vehicle', help='Process a single vehicle ID')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    asyncio.run(run_maintenance_scraper(
        vehicle_filter=args.vehicle,
        dry_run=args.dry_run,
    ))
