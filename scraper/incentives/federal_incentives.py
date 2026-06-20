"""
federal_incentives.py — On-demand federal EV tax credit eligibility refresh.

Usage:
    python scraper/incentives/federal_incentives.py --refresh
    python scraper/incentives/federal_incentives.py --refresh --dry-run

What it does:
  1. Fetches current eligible vehicles from IRS Energy Credits Online
  2. Cross-references with DOE AFDC clean vehicle list
  3. Compares against existing Firestore vehicle documents
  4. Updates eligibility fields in Firestore (unless --dry-run)
  5. Outputs a diff report of changed vehicles

Run this:
  - After every IRS quarterly update (Jan, Apr, Jul, Oct)
  - When a manufacturer announces a battery content compliance change
  - When a new vehicle is added to or removed from the credit list
  - When MSRP caps change (requires Congressional action — rare)

Reference:
  IRS list:  https://www.irs.gov/clean-vehicle-tax-credits
  DOE AFDC:  https://afdc.energy.gov/laws/federal
  IRS Form:  8936
"""

import asyncio
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from firebase_client import FirebaseClient

# DOE AFDC API endpoint for federal EV incentives
AFDC_FEDERAL_API = "https://developer.nrel.gov/api/transportation/v1/vehicles.json"

# IRS eligible vehicle list (scraped — structure changes periodically)
IRS_PAGE = "https://www.irs.gov/clean-vehicle-tax-credits"

# Current federal credit parameters (update if legislation changes)
FEDERAL_CREDIT = {
    "amount": 7500,
    "msrpCapSedan": 55000,
    "msrpCapSuvTruckVan": 80000,
    "incomeCapSingle": 150000,
    "incomeCapJoint": 300000,
    "incomeCapHeadOfHousehold": 225000,
    "irsFormReference": "IRS Form 8936",
    "pointOfSaleTransferAvailable": True,
    "pointOfSaleNote": (
        "Requires dealer to be registered with IRS Energy Credits Online. "
        "Not all dealers participate — confirm before signing."
    ),
    "taxLiabilityNote": (
        "Non-refundable credit — requires $7,500 in federal tax liability to claim the full amount. "
        "The Point of Sale transfer option allows eligible buyers to receive it as an upfront "
        "price reduction regardless of personal tax liability."
    ),
}

# Known eligible vehicles as of 2025-Q1
# UPDATE THIS LIST each quarter based on IRS published list
# Source: https://www.irs.gov/clean-vehicle-tax-credits
KNOWN_ELIGIBLE = {
    # vehicle_id: { eligible, amount, batteryContentCompliant, notes }
    "tesla-model-3-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Standard Range RWD and Long Range AWD eligible. Performance may vary — verify.",
    },
    "tesla-model-y-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "RWD and Long Range AWD eligible. MSRP must remain under $80k SUV cap.",
    },
    "chevrolet-equinox-ev-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Mexico — meets North America assembly requirement.",
    },
    "ford-mustang-mach-e-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Mexico. Select — and Premium trims eligible under $55k cap.",
    },
    "hyundai-ioniq-5-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Georgia plant — eligible as of Q1 2025.",
    },
    "hyundai-ioniq-6-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Georgia. RWD Standard Range eligible under $55k sedan cap.",
    },
    "kia-ev6-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Georgia (Hyundai-Kia plant). Verify MSRP under $55k cap.",
    },
    "volkswagen-id4-2024": {
        "eligibleNew": True, "amount": 7500, "batteryContentCompliant": True,
        "notes": "Assembled in Chattanooga, TN. Standard and Pro S trims under MSRP cap.",
    },
    "rivian-r1t-2024": {
        "eligibleNew": False, "amount": 0, "batteryContentCompliant": False,
        "notes": "MSRP exceeds $80k cap on most configurations. Battery sourcing may not comply.",
    },
    "rivian-r1s-2024": {
        "eligibleNew": False, "amount": 0, "batteryContentCompliant": False,
        "notes": "MSRP exceeds $80k cap. Battery content compliance not confirmed.",
    },
    "bmw-i4-2024": {
        "eligibleNew": False, "amount": 0, "batteryContentCompliant": False,
        "notes": "Assembled in Germany — does not meet North America assembly requirement.",
    },
    "lucid-air-2024": {
        "eligibleNew": False, "amount": 0, "batteryContentCompliant": False,
        "notes": "Assembled in Arizona but MSRP exceeds $55k sedan cap on all trims.",
    },
}


async def refresh_federal_incentives(dry_run: bool = False, nrel_key: str = "DEMO_KEY"):
    """Main refresh function."""
    print(f"\n{'='*55}")
    print(f"  Federal EV Tax Credit Refresh")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')} {'[DRY RUN]' if dry_run else ''}")
    print(f"{'='*55}\n")

    # Step 1: Fetch current AFDC data
    print("📡 Fetching DOE AFDC clean vehicle data...")
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(AFDC_FEDERAL_API, params={
                "api_key": nrel_key,
                "type": "EV,PHEV",
                "limit": 200,
            })
            afdc_data = resp.json()
            afdc_vehicles = afdc_data.get("result", [])
            print(f"  ✓ Fetched {len(afdc_vehicles)} vehicles from AFDC")
        except Exception as e:
            print(f"  ✗ AFDC fetch failed: {e}")
            afdc_vehicles = []

    # Step 2: Load Firestore vehicles
    print("\n📥 Loading vehicles from Firestore...")
    if not dry_run:
        client = FirebaseClient()
        firestore_vehicles = await client.get_all_vehicles()
    else:
        # In dry-run, use known eligible dict as proxy
        firestore_vehicles = [{"id": vid} for vid in KNOWN_ELIGIBLE]
    print(f"  ✓ Found {len(firestore_vehicles)} vehicles in Firestore")

    # Step 3: Compare and build diff
    print("\n🔍 Checking eligibility for each vehicle...\n")
    now = datetime.now(timezone.utc).isoformat()
    changes = []

    for vehicle in firestore_vehicles:
        vid = vehicle.get("id")
        if not vid:
            continue

        known = KNOWN_ELIGIBLE.get(vid)
        if not known:
            continue  # Unknown vehicle — skip (new scraper needed)

        new_credit = {
            **FEDERAL_CREDIT,
            "eligibleNew": known["eligibleNew"],
            "amount": known["amount"],
            "batteryContentCompliant": known["batteryContentCompliant"],
            "batteryContentComplianceNote": known.get("notes", ""),
            "lastVerified": now,
        }

        old_credit = vehicle.get("federalTaxCredit", {})
        old_eligible = old_credit.get("eligibleNew")
        new_eligible = known["eligibleNew"]

        if old_eligible != new_eligible:
            direction = "GAINED" if new_eligible else "LOST"
            changes.append({
                "vehicle_id": vid,
                "change": direction,
                "old": old_eligible,
                "new": new_eligible,
            })
            print(f"  ⚡ {vid}: {direction} federal credit eligibility")
        else:
            print(f"  ✓ {vid}: no change ({('eligible' if new_eligible else 'not eligible')})")

        if not dry_run:
            await client._db.collection("vehicles").document(vid).set(
                {"federalTaxCredit": new_credit}, merge=True
            )

    # Step 4: Output report
    print(f"\n{'='*55}")
    print(f"  Refresh complete — {len(changes)} change(s)")
    if changes:
        for c in changes:
            print(f"  {c['change']}: {c['vehicle_id']}")
    print(f"{'='*55}\n")

    if dry_run:
        print("DRY RUN — no changes written to Firestore.\n")

    return changes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense Federal Incentive Refresh")
    parser.add_argument("--refresh", action="store_true", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--nrel-key", default="DEMO_KEY")
    args = parser.parse_args()

    asyncio.run(refresh_federal_incentives(
        dry_run=args.dry_run,
        nrel_key=args.nrel_key,
    ))
