"""
outofspec_scraper.py — Scrapes Out of Spec Studios real-world test data.

Out of Spec Studios conducts two standardised tests:
  1. Charging curve test: 0–100% from a dead battery, measuring kW at each % SoC
  2. 70 mph range test: constant 70 mph highway driving until battery depletes

Their data is published as Tableau Public dashboards embedded on their website.
This scraper accesses the Tableau Public REST API to extract the underlying data.

Tableau Public API:
  Workbooks are at: public.tableau.com/views/{workbook}/{sheet}
  Data API:         public.tableau.com/views/{workbook}/{sheet}.csv  (for download)

Known workbook names (from the embed URLs on their site):
  Charging curves:  Chargingcurves_2
  70 mph range:     OutofSpec70mphrange

Data stored in Firestore: vehicles/{id}/realWorldStats/outofspec

Usage:
    python scraper/scrapers/outofspec_scraper.py
    python scraper/scrapers/outofspec_scraper.py --vehicle tesla-model-3-2024
    python scraper/scrapers/outofspec_scraper.py --dry-run
"""

import asyncio
import argparse
import sys
import csv
import io
import re
from pathlib import Path
from datetime import datetime, timezone

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S, setup_logging

import logging
setup_logging()

TABLEAU_BASE = "https://public.tableau.com/views"

# Tableau workbook/sheet names (from the embed src on outofspecstudios.com)
CHARGING_WORKBOOK  = "Chargingcurves_2"
CHARGING_SHEETS    = ["Sheet1", "Sheet2"]   # Sheet1 = curve chart, Sheet2 = summary table
RANGE_WORKBOOK     = "OutofSpec70mphrange"
RANGE_SHEETS       = ["Sheet1", "Sheet2"]

# Map vehicle names to what Out of Spec labels them in Tableau
# (OOS uses their own naming — often "Make Model Trim Year")
OOS_VEHICLE_LABELS = {
    "tesla-model-3-2024":        ["Tesla Model 3", "Model 3 RWD", "Model 3 AWD"],
    "tesla-model-y-2024":        ["Tesla Model Y", "Model Y RWD", "Model Y AWD"],
    "ford-mustang-mach-e-2024":  ["Ford Mustang Mach-E", "Mach-E"],
    "chevrolet-equinox-ev-2024": ["Chevy Equinox EV", "Equinox EV"],
    "hyundai-ioniq-5-2024":      ["Hyundai IONIQ 5", "IONIQ 5"],
    "hyundai-ioniq-6-2024":      ["Hyundai IONIQ 6", "IONIQ 6"],
    "kia-ev6-2024":              ["Kia EV6", "EV6"],
    "rivian-r1t-2024":           ["Rivian R1T", "R1T"],
    "rivian-r1s-2024":           ["Rivian R1S", "R1S"],
    "bmw-i4-2024":               ["BMW i4", "i4"],
    "lucid-air-2024":            ["Lucid Air", "Lucid Air Grand Touring"],
    "volkswagen-id4-2024":       ["Volkswagen ID.4", "ID.4"],
}


async def fetch_tableau_csv(workbook: str, sheet: str, client: httpx.AsyncClient) -> list[dict] | None:
    """
    Fetch a Tableau Public workbook sheet as CSV.
    Tableau Public exposes a .csv download endpoint for public workbooks.
    """
    url = f"{TABLEAU_BASE}/{workbook}/{sheet}.csv"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code == 404:
            logging.warning(f"  Tableau 404: {workbook}/{sheet}")
            return None
        resp.raise_for_status()
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        logging.info(f"  Tableau {workbook}/{sheet}: {len(rows)} rows")
        return rows
    except Exception as e:
        logging.warning(f"  Tableau fetch failed ({workbook}/{sheet}): {e}")
        return None


def extract_vehicle_charging_data(rows: list[dict], vehicle_labels: list[str]) -> dict | None:
    """
    Extract charging data for a specific vehicle from Tableau CSV rows.
    Returns summary stats: peak_kw, avg_kw, time_to_80_min.
    """
    if not rows:
        return None

    # Find rows matching this vehicle
    vehicle_rows = []
    for row in rows:
        row_text = " ".join(str(v) for v in row.values()).lower()
        if any(label.lower() in row_text for label in vehicle_labels):
            vehicle_rows.append(row)

    if not vehicle_rows:
        return None

    # Extract kW values — look for columns containing power/kW data
    kw_values = []
    for row in vehicle_rows:
        for key, val in row.items():
            if any(k in key.lower() for k in ["kw", "power", "charging"]):
                try:
                    kw_values.append(float(str(val).replace(",", "")))
                except (ValueError, TypeError):
                    pass

    if not kw_values:
        return None

    peak_kw = max(kw_values)
    avg_kw  = sum(kw_values) / len(kw_values)

    return {
        "peakChargingKw": round(peak_kw, 1),
        "avgChargingKw":  round(avg_kw, 1),
        "dataPoints":     len(kw_values),
    }


def extract_vehicle_range_data(rows: list[dict], vehicle_labels: list[str]) -> dict | None:
    """
    Extract 70mph range test results for a specific vehicle.
    Returns: range_miles, efficiency_wh_per_mile, percentage_of_epa.
    """
    if not rows:
        return None

    vehicle_rows = []
    for row in rows:
        row_text = " ".join(str(v) for v in row.values()).lower()
        if any(label.lower() in row_text for label in vehicle_labels):
            vehicle_rows.append(row)

    if not vehicle_rows:
        return None

    # Look for range/miles columns
    range_values = []
    efficiency_values = []

    for row in vehicle_rows:
        for key, val in row.items():
            key_lower = key.lower()
            if any(k in key_lower for k in ["range", "miles", "distance"]):
                try:
                    v = float(str(val).replace(",", ""))
                    if 50 < v < 700:  # sanity check for miles
                        range_values.append(v)
                except (ValueError, TypeError):
                    pass
            if any(k in key_lower for k in ["wh/mi", "efficiency", "kwh/100"]):
                try:
                    efficiency_values.append(float(str(val).replace(",", "")))
                except (ValueError, TypeError):
                    pass

    if not range_values:
        return None

    return {
        "realWorldRange70mph": round(max(range_values)),
        "efficiencyWhPerMile": round(sum(efficiency_values) / len(efficiency_values)) if efficiency_values else None,
    }


async def run_outofspec_scraper(vehicle_filter=None, dry_run=False):
    from firebase_client import FirebaseClient
    db = FirebaseClient()

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/csv,application/csv,text/plain",
        "Referer": "https://outofspecstudios.com/",
    }

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        # Fetch all Tableau data once
        logging.info("[OutOfSpec] Fetching charging curve data…")
        charging_rows = await fetch_tableau_csv(CHARGING_WORKBOOK, "Sheet2", client)
        await asyncio.sleep(RATE_LIMIT_MIN_S)

        logging.info("[OutOfSpec] Fetching 70mph range data…")
        range_rows = await fetch_tableau_csv(RANGE_WORKBOOK, "Sheet2", client)
        await asyncio.sleep(RATE_LIMIT_MIN_S)

        vehicle_ids = [vehicle_filter] if vehicle_filter else list(OOS_VEHICLE_LABELS)

        for vid in vehicle_ids:
            labels = OOS_VEHICLE_LABELS.get(vid, [])
            if not labels:
                continue

            logging.info(f"[{vid}] Processing Out of Spec data…")

            charging = extract_vehicle_charging_data(charging_rows or [], labels)
            range_data = extract_vehicle_range_data(range_rows or [], labels)

            if not charging and not range_data:
                logging.info(f"  [{vid}] No OOS data found (vehicle may not have been tested)")
                continue

            stats = {
                "source": "Out of Spec Studios",
                "sourceUrl": "https://outofspecstudios.com",
                "lastUpdated": datetime.now(timezone.utc).isoformat(),
            }
            if charging:
                stats["charging"] = charging
                logging.info(f"  [{vid}] Charging: peak={charging['peakChargingKw']}kW avg={charging['avgChargingKw']}kW")
            if range_data:
                stats["range70mph"] = range_data
                logging.info(f"  [{vid}] Range: {range_data['realWorldRange70mph']} mi at 70mph")

            if dry_run:
                logging.info(f"  [DRY RUN] Would write: {stats}")
                continue

            db._db.collection("vehicles").document(vid).set(
                {"realWorldStats": {"outofspec": stats}},
                merge=True,
            )

    if dry_run:
        logging.info("[DRY RUN] No data written.")
    else:
        logging.info("[OutOfSpec] Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense Out of Spec Studios Scraper")
    parser.add_argument("--vehicle")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_outofspec_scraper(args.vehicle, args.dry_run))
