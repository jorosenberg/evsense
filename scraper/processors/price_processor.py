"""
price_processor.py — Detects and records vehicle price changes between scrape runs.

When the scraper fetches new vehicle data, this processor:
1. Compares the new MSRP against the existing Firestore document's MSRP
2. If changed, records a price change event in `trim.lastPriceChange`
3. Generates a price history array (up to 12 data points) in `priceHistory`

This drives the "Price dropped $X" / "Price increased $X" badges in the UI
and the price history chart (Tier 3 feature).

Usage:
    Called automatically by main.py after each successful vehicle scrape.
    Can also be run standalone:
    python scraper/processors/price_processor.py --vehicle tesla-model-3-2024
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import setup_logging

import logging
setup_logging()


def detect_price_change(
    existing_doc: dict,
    new_data: dict,
) -> tuple[dict, bool]:
    """
    Compare existing and new vehicle data, recording any price change.

    Returns:
        (updated_new_data, changed: bool)
        updated_new_data has lastPriceChange and priceHistory populated.
    """
    changed = False
    now = datetime.now(timezone.utc).isoformat()

    existing_trims = existing_doc.get('trims', [])
    new_trims = new_data.get('trims', [])

    for i, new_trim in enumerate(new_trims):
        new_msrp = new_trim.get('msrp')
        if new_msrp is None:
            continue

        # Find matching existing trim by name
        existing_trim = next(
            (t for t in existing_trims if t.get('name') == new_trim.get('name')),
            existing_trims[i] if i < len(existing_trims) else None
        )

        if not existing_trim:
            # New trim — no previous price to compare
            continue

        old_msrp = existing_trim.get('msrp')
        if old_msrp is None or old_msrp == new_msrp:
            # No change — carry over the existing lastPriceChange record
            new_trims[i]['lastPriceChange'] = existing_trim.get('lastPriceChange')
            continue

        # Price changed
        change_dollars = new_msrp - old_msrp
        direction = 'increase' if change_dollars > 0 else 'decrease'
        changed = True

        price_change_record = {
            'date': now,
            'previousMsrp': old_msrp,
            'changeDollars': change_dollars,
            'direction': direction,
        }

        new_trims[i]['lastPriceChange'] = price_change_record

        action = '▲ increased' if direction == 'increase' else '▼ decreased'
        logging.info(
            f"  Price {action} for {new_data.get('id')} trim '{new_trim.get('name')}': "
            f"${old_msrp:,} → ${new_msrp:,} ({'+' if change_dollars > 0 else ''}{change_dollars:,})"
        )

    # Update priceHistory array (rolling 12-entry log of base MSRP over time)
    new_base_msrp = new_data.get('msrpFrom') or (new_trims[0].get('msrp') if new_trims else None)
    old_history: list = existing_doc.get('priceHistory', [])

    if new_base_msrp:
        new_entry = {'date': now, 'msrp': new_base_msrp}
        # Only add if price actually changed from the last recorded entry
        last_entry = old_history[-1] if old_history else None
        if not last_entry or last_entry.get('msrp') != new_base_msrp:
            new_history = (old_history + [new_entry])[-12]  # Keep last 12 data points
            new_data['priceHistory'] = new_history
        else:
            new_data['priceHistory'] = old_history
    else:
        new_data['priceHistory'] = old_history

    new_data['trims'] = new_trims
    return new_data, changed


def process_prices_before_write(existing_doc: Optional[dict], new_data: dict) -> dict:
    """
    Main entry point. Called by main.py before writing to Firestore.
    If existing_doc is None (first time), returns new_data unchanged.
    """
    if not existing_doc:
        # First write — initialise price history
        base_msrp = new_data.get('msrpFrom') or (
            new_data['trims'][0].get('msrp') if new_data.get('trims') else None
        )
        if base_msrp:
            new_data['priceHistory'] = [{
                'date': datetime.now(timezone.utc).isoformat(),
                'msrp': base_msrp,
            }]
        return new_data

    updated_data, changed = detect_price_change(existing_doc, new_data)

    if changed:
        logging.info(f"  Price change recorded for {new_data.get('id')}")

    return updated_data
