"""
state_incentives.py — On-demand state EV incentive refresh via DOE AFDC API.

Usage:
    python scraper/incentives/state_incentives.py --refresh
    python scraper/incentives/state_incentives.py --refresh --state NY
    python scraper/incentives/state_incentives.py --refresh --dry-run

What it does:
  1. Queries the AFDC State Laws & Incentives API for each state
  2. Filters for EV purchase rebates, tax credits, and EVSE rebates
  3. Updates Firestore state_data collection
  4. Regenerates frontend/src/utils/incentivesData.js static fallback

NREL API key: Free at https://developer.nrel.gov/signup/
Rate limits: 1,000 req/hour on free tier — 50 states fits comfortably in one run.
"""

import asyncio
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from firebase_client import FirebaseClient

AFDC_STATE_API = "https://developer.nrel.gov/api/transportation/v1/legislations.json"

# States to refresh (all 50 + DC by default)
ALL_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
]

# Legislation types that represent EV purchase incentives
EV_INCENTIVE_TYPES = {
    "state_tax_credit",
    "rebate",
    "grant",
    "voucher",
    "sales_tax_exemption",
    "reduced_registration_fee",
}

# Categories that indicate EV relevance
EV_CATEGORIES = {"ev_acquisition", "evse", "ev_purchase"}


async def fetch_state_incentives(state: str, nrel_key: str, client: httpx.AsyncClient) -> list[dict]:
    """Fetch EV incentives for a single state from AFDC API."""
    try:
        resp = await client.get(AFDC_STATE_API, params={
            "api_key": nrel_key,
            "state": state,
            "status": "current",
            "type": "incentive",
            "limit": 50,
        }, timeout=20)
        data = resp.json()
        laws = data.get("result", [])

        incentives = []
        for law in laws:
            # Filter to EV-relevant incentives
            categories = {c.get("code", "") for c in law.get("categories", [])}
            if not categories.intersection(EV_CATEGORIES):
                continue

            legislation_type = law.get("type_code", "")
            if legislation_type not in EV_INCENTIVE_TYPES:
                continue

            # Parse incentive amount (AFDC doesn't always provide structured amounts)
            amount = _parse_amount(law.get("benefit", ""))
            applies_to = _parse_applies_to(law)

            incentive = {
                "name": law.get("title", "Unknown Incentive"),
                "type": legislation_type,
                "amount": amount,
                "appliesTo": applies_to,
                "url": law.get("url", ""),
                "notes": _truncate(law.get("description", ""), 300),
                "expiresAt": law.get("expired_on"),
                "lastVerified": datetime.now(timezone.utc).isoformat(),
                "sourceId": law.get("id"),
            }
            incentives.append(incentive)

        return incentives
    except Exception as e:
        print(f"  ✗ {state}: API error — {e}")
        return []


def _parse_amount(benefit_text: str) -> int:
    """
    Attempt to extract a dollar amount from the AFDC benefit description.
    AFDC benefit field is free text like '$2,000 rebate' or 'Up to $4,500'.
    """
    import re
    if not benefit_text:
        return 0
    # Find dollar amounts — take the largest mentioned
    amounts = re.findall(r'\$([0-9,]+)', benefit_text)
    if not amounts:
        return 0
    return max(int(a.replace(',', '')) for a in amounts)


def _parse_applies_to(law: dict) -> list[str]:
    """Determine what the incentive applies to (new purchase, used, EVSE)."""
    categories = {c.get("code", "") for c in law.get("categories", [])}
    applies = []
    if "ev_acquisition" in categories or "ev_purchase" in categories:
        applies.append("new")
    if "evse" in categories:
        applies.append("home_charger")
    return applies or ["new"]


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(' ', 1)[0] + '…'


async def refresh_state_incentives(
    states: list[str] = None,
    dry_run: bool = False,
    nrel_key: str = "DEMO_KEY",
):
    """Main refresh function."""
    states = states or ALL_STATES
    print(f"\n{'='*55}")
    print(f"  State EV Incentive Refresh — {len(states)} states")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')} {'[DRY RUN]' if dry_run else ''}")
    print(f"{'='*55}\n")

    if not dry_run:
        db_client = FirebaseClient()

    all_incentives = {}
    async with httpx.AsyncClient() as http:
        for state in states:
            print(f"  Fetching {state}...", end=" ")
            incentives = await fetch_state_incentives(state, nrel_key, http)
            all_incentives[state] = incentives
            print(f"{len(incentives)} incentive(s) found")

            if not dry_run and incentives:
                # Update Firestore state_data/{STATE}
                await db_client._db.collection("state_data").document(state).set(
                    {"incentives": incentives, "incentivesLastUpdated": datetime.now(timezone.utc).isoformat()},
                    merge=True
                )

            # Rate limit — AFDC is lenient but be polite
            await asyncio.sleep(0.5)

    # Regenerate the static incentivesData.js fallback
    _write_static_js(all_incentives, dry_run)

    print(f"\n{'='*55}")
    print(f"  Refresh complete — {sum(len(v) for v in all_incentives.values())} total incentives")
    if dry_run:
        print("  DRY RUN — no changes written")
    print(f"{'='*55}\n")

    return all_incentives


def _write_static_js(incentives_by_state: dict, dry_run: bool):
    """
    Write a static JS fallback file used when Firestore is unavailable.
    Located at: frontend/src/utils/incentivesData.js
    """
    output_path = Path(__file__).parent.parent.parent / "frontend" / "src" / "utils" / "incentivesData.js"
    now = datetime.now().strftime("%Y-%m-%d")

    lines = [
        "/**",
        " * incentivesData.js — State EV incentive data (static fallback)",
        f" * Auto-generated by state_incentives.py on {now}",
        " * Source: DOE AFDC State Laws & Incentives API",
        " * To refresh: python scraper/incentives/state_incentives.py --refresh",
        " */\n",
        "export const STATE_INCENTIVES = {",
    ]

    for state, incentives in sorted(incentives_by_state.items()):
        if not incentives:
            continue
        lines.append(f"  {state}: {json.dumps(incentives, indent=4)},")

    lines.extend([
        "};\n",
        "export function getStateIncentives(stateAbbr) {",
        "  return STATE_INCENTIVES[stateAbbr?.toUpperCase()] || [];",
        "}\n",
        "export function getTotalStateRebate(stateAbbr, vehicleMsrp, isNew = true) {",
        "  const incentives = getStateIncentives(stateAbbr);",
        "  return incentives",
        "    .filter(i => {",
        "      if (!i.appliesTo?.includes(isNew ? 'new' : 'used')) return false;",
        "      if (i.type === 'tax_exemption' || i.type === 'sales_tax_exemption') return false;",
        "      if (i.maxMsrp && vehicleMsrp > i.maxMsrp) return false;",
        "      return true;",
        "    })",
        "    .reduce((sum, i) => sum + (i.amount || 0), 0);",
        "}",
    ])

    content = "\n".join(lines)

    if dry_run:
        print(f"\n[DRY RUN] Would write {len(content)} bytes to {output_path}")
    else:
        output_path.write_text(content)
        print(f"\n  ✓ Wrote incentivesData.js ({len(content)} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EVsense State Incentive Refresh")
    parser.add_argument("--refresh", action="store_true", required=True)
    parser.add_argument("--state", help="Single state abbreviation (e.g. NY)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--nrel-key", default=os.environ.get("NREL_API_KEY", "DEMO_KEY"))
    args = parser.parse_args()

    states = [args.state.upper()] if args.state else None
    asyncio.run(refresh_state_incentives(
        states=states,
        dry_run=args.dry_run,
        nrel_key=args.nrel_key,
    ))
