"""
matcher_generator.py — Build matcher_vehicles.json from curated + catalog data.

What this produces:
  frontend/public/data/matcher_vehicles.json
    [
      { id, make, model, year, msrpFrom, rangeEpa, milesPerKwh,
        leaseFrom, financeFrom, chargingPort, bodyStyle, seatingCapacity,
        zeroToSixty, drivetrains, imageUrl, imagesCdnBase,
        dataQuality: "full" | "estimated" }
    ]

Why this file:
  • The Matcher needs every vehicle, not just the 30 we curated by hand.
  • ev_database.json has 1,350 vehicles but lacks lease/finance offers, exact
    luxury features, and curated efficiency. We *estimate* those fields so the
    scoring engine (which always calls `quickTco`) works for every row.

Estimation rules (Tier 2 — "estimated" data quality):
  • leaseFrom    = round(msrpFrom × 0.012)   ("1.2% rule" — close to real)
  • financeFrom  = 60-month PMT @ 6.5% APR, 10% down
  • milesPerKwh  = source efficiency if present, else rangeEpa / (battery × 0.88)
  • chargingPort = NACS for Tesla, CCS1 for most US 2024+, CHAdeMO for older Nissan
  • bodyStyle    = mapped from ev-database `body_shape`

Sizing:
  ~300 vehicles × ~800 bytes ≈ 240 KB. Acceptable single-file fetch.
  Filtered to US-available + current/recent vehicles (status != "discontinued").

CLI:
    python matcher_generator.py
    python matcher_generator.py --max 200
    python matcher_generator.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────────────
SCRAPER_DIR  = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR     = PROJECT_ROOT / "frontend" / "public" / "data"
SUMMARY_IN   = DATA_DIR / "vehicles_summary.json"
US_CATALOG_IN = DATA_DIR / "us_ev_catalog.json"   # fueleconomy.gov (EPA/DOE) — preferred Tier 2
EVDB_IN      = DATA_DIR / "ev_database.json"        # ev-database.org (EU) — last-resort Tier 2
OUT_PATH     = DATA_DIR / "matcher_vehicles.json"

# ── Estimation rules ─────────────────────────────────────────────────────────
LEASE_RULE_PCT       = 0.012  # 1.2% of MSRP
FINANCE_DOWN_PCT     = 0.10
FINANCE_APR          = 0.065
FINANCE_TERM_MONTHS  = 60

# Body-shape → bodyStyle taxonomy used by the frontend. Keys are lowercased
# so we match ev-database's "Suv" / "Pickup" / "Mpv" variations.
BODY_MAP = {
    "hatchback":  "hatchback",
    "sedan":      "sedan",
    "liftback":   "sedan",
    "coupe":      "coupe",
    "convertible":"coupe",
    "station":    "wagon",
    "wagon":      "wagon",
    "suv":        "suv",
    "spv":        "suv",      # ev-database alt code
    "crossover":  "suv",
    "pickup":     "truck",
    "truck":      "truck",
    "mpv":        "van",
    "minivan":    "van",
    "van":        "van",
}


def _estimate_finance(msrp: Optional[float]) -> Optional[int]:
    if not msrp or msrp <= 0:
        return None
    p = msrp * (1 - FINANCE_DOWN_PCT)
    r = FINANCE_APR / 12
    n = FINANCE_TERM_MONTHS
    pmt = (p * r * (1 + r) ** n) / ((1 + r) ** n - 1)
    return int(round(pmt))


def _estimate_lease(msrp: Optional[float]) -> Optional[int]:
    if not msrp or msrp <= 0:
        return None
    return int(round(msrp * LEASE_RULE_PCT))


def _estimate_efficiency(range_mi: Optional[float], battery_kwh: Optional[float]) -> Optional[float]:
    if not range_mi or not battery_kwh or battery_kwh <= 0:
        return None
    usable = battery_kwh * 0.88
    if usable <= 0:
        return None
    return round(range_mi / usable, 2)


def _guess_port(make: str, plug_type: str) -> str:
    m = (make or "").lower()
    p = (plug_type or "").lower()
    if "nacs" in p or "tesla" in p or m == "tesla":
        return "NACS"
    if "chademo" in p:
        return "CHAdeMO"
    return "CCS1"


def _body_style(body_shape: str) -> str:
    return BODY_MAP.get((body_shape or "").strip().lower(), "sedan")


def _msrp_to_luxury_score(msrp: Optional[float]) -> float:
    """Fallback luxury estimate when curated map is missing."""
    if not msrp:
        return 3.0
    if msrp >= 130_000: return 9.5
    if msrp >=  90_000: return 8.0
    if msrp >=  70_000: return 6.8
    if msrp >=  50_000: return 5.5
    if msrp >=  40_000: return 4.2
    if msrp >=  30_000: return 3.2
    return 2.5


# ── Build a single Tier-2 entry from an ev-database row ──────────────────────
def from_evdb_row(row: dict) -> Optional[dict]:
    """
    Convert ev-database.org row → matcher vehicle entry (Tier 2).
    Returns None if row is unusable (missing critical fields).
    """
    # Filter: only available models with US-equivalent pricing
    if row.get("status") not in ("current", "recent"):
        return None

    prices = row.get("prices", {})
    # Prefer DE EUR price (best EV market parity), convert to USD via rate
    # already encoded in JSON (`exchange_rates_used` at top level — caller passes).
    # Here we trust whatever USD-equivalent the catalog has stored as `msrp_usd`
    # if present, else derive from EUR/GBP at conventional rates.
    msrp_usd = row.get("msrp_usd")
    if not msrp_usd:
        de = prices.get("DE")
        uk = prices.get("UK")
        nl = prices.get("NL")
        if de and de.get("currency") == "EUR":
            msrp_usd = round(de["amount"] * 1.08)
        elif nl and nl.get("currency") == "EUR":
            msrp_usd = round(nl["amount"] * 1.08)
        elif uk and uk.get("currency") == "GBP":
            msrp_usd = round(uk["amount"] * 1.27)
        else:
            return None

    range_mi = row.get("range_mi")
    if not range_mi:
        return None

    battery = row.get("battery_kwh")
    eff = row.get("efficiency_mi_per_kwh") or _estimate_efficiency(range_mi, battery)
    if not eff or eff < 1.5 or eff > 8.0:   # sanity bound
        eff = 3.5  # default

    make  = row.get("make", "").strip()
    model = row.get("model", "").strip()
    year  = row.get("year_from", 2024) or 2024
    raw_id = row.get("id") or f"{make}-{model}-{year}"
    # Normalize id to match curated key style
    vid = raw_id.replace("evdb-", "").replace(" ", "-").lower()

    return {
        "id": vid,
        "make": make,
        "model": model,
        "year": year,
        "type": "new",
        "bodyStyle": _body_style(row.get("body_shape", "")),
        "msrpFrom": msrp_usd,
        "rangeEpa": int(range_mi),
        "milesPerKwh": float(eff),
        "horsepower": None,
        "zeroToSixty": row.get("accel_0_60_s"),
        "seatingCapacity": row.get("seat_count") or 5,
        "towingCapacityLbs": row.get("towing_lbs"),
        "chargingPort": _guess_port(make, row.get("plug_type", "")),
        "drivetrains": [row.get("drivetrain", "AWD")] if row.get("drivetrain") else ["AWD"],
        "imageUrl": row.get("image_url") or "",
        "imageGallery": [],
        "imagesCdnBase": None,            # set later by image_pipeline.py
        "leaseFrom": _estimate_lease(msrp_usd),
        "financeFrom": _estimate_finance(msrp_usd),
        "federalCreditEligible": False,   # post-IRA-repeal
        "federalCreditAmount": 0,
        "luxuryScoreEstimate": _msrp_to_luxury_score(msrp_usd),
        "dataQuality": "estimated",
        "lastUpdated": row.get("scraped_at") or datetime.now(timezone.utc).isoformat(),
    }


# ── US catalog (fueleconomy.gov) → matcher entry ─────────────────────────────
# Class-based starting MSRP estimate, used only when the US catalog has no
# curated price. Mirrors the conservative anchor in us_ev_catalog_scraper.py so
# uncurated / brand-new models still enter the Matcher pool (flagged estimated).
_CLASS_MSRP_BASE = {
    "sedan": 42000, "coupe": 60000, "wagon": 48000,
    "suv": 50000, "truck": 62000, "van": 58000,
}


def _estimate_msrp_from_class(body_style: str, range_mi, motor_kw) -> int:
    base = _CLASS_MSRP_BASE.get(body_style, 46000)
    if range_mi and range_mi >= 320:
        base += 6000
    elif range_mi and range_mi < 230:
        base -= 4000
    if motor_kw and motor_kw >= 400:
        base += 12000
    return int(round(base / 500) * 500)


def from_us_catalog_row(row: dict) -> Optional[dict]:
    """
    Convert a fueleconomy.gov (EPA/DOE) US-catalog model entry → matcher entry.

    These rows carry authoritative US EPA range / efficiency / drivetrain, so we
    use them verbatim. Price is curated where known, otherwise class-estimated.
    Marked dataQuality="estimated" (lease/finance are still modeled) with
    dataSource="us_epa" so the UI can distinguish EPA-grade specs.
    """
    make  = (row.get("make") or "").strip()
    model = (row.get("model") or "").strip()
    if not make or not model:
        return None

    body_style = row.get("body_style") or "sedan"
    motor_kw   = row.get("motor_power_kw")

    range_mi = row.get("range_mi")
    range_estimated = False
    if not range_mi:
        # Upcoming models from the vPIC radar carry no EPA range yet. Rather than
        # drop them, surface a conservative class-based placeholder so they appear
        # as "coming soon" cards; flagged rangeEstimated so the UI can caveat it.
        if row.get("status") == "upcoming" or row.get("needs_specs"):
            range_mi = {"truck": 280, "suv": 270, "van": 240}.get(body_style, 290)
            range_estimated = True
        else:
            return None
    msrp = row.get("msrp_usd")
    msrp_estimated = False
    if not msrp:
        msrp = _estimate_msrp_from_class(body_style, range_mi, motor_kw)
        msrp_estimated = True

    eff = row.get("efficiency_mi_per_kwh")
    if not eff or eff < 1.5 or eff > 8.0:
        eff = _estimate_efficiency(range_mi, row.get("battery_kwh_estimate")) or 3.0

    drivetrains = row.get("drivetrains") or ["AWD"]
    year = row.get("year") or 2026

    return {
        "id": row.get("id") or f"us-{make}-{model}-{year}".lower().replace(" ", "-"),
        "make": make,
        "model": model,
        "year": year,
        "type": "new",
        "bodyStyle": _body_style(body_style),
        "msrpFrom": int(msrp),
        "rangeEpa": int(range_mi),
        "milesPerKwh": float(eff),
        "horsepower": row.get("horsepower_est"),
        "zeroToSixty": None,
        "seatingCapacity": row.get("seat_count") or 5,
        "towingCapacityLbs": None,
        "chargingPort": _guess_port(make, ""),
        "drivetrains": drivetrains,
        "imageUrl": row.get("image_url") or "",
        "imageGallery": [],
        "imagesCdnBase": None,
        "leaseFrom": _estimate_lease(msrp),
        "financeFrom": _estimate_finance(msrp),
        "federalCreditEligible": False,
        "federalCreditAmount": 0,
        "luxuryScoreEstimate": _msrp_to_luxury_score(msrp),
        "dataQuality": "estimated",
        "dataSource": "us_epa",
        "msrpEstimated": msrp_estimated,
        "rangeEstimated": range_estimated,
        "comingSoon": row.get("status") == "upcoming",
        "trimCount": row.get("trim_count"),
        "lastUpdated": row.get("last_updated") or datetime.now(timezone.utc).isoformat(),
    }


# ── Normalized de-dup key ────────────────────────────────────────────────────
def _norm_key(make: str, model: str) -> str:
    """make+model collapsed to alphanumerics: 'Tesla', 'Model 3' -> 'tesla|model3'."""
    import re as _re
    m = _re.sub(r"[^a-z0-9]+", "", (make or "").lower())
    md = _re.sub(r"[^a-z0-9]+", "", (model or "").lower())
    return f"{m}|{md}"


# ── Build a Tier-1 entry from vehicles_summary.json ──────────────────────────
def from_summary_row(row: dict) -> dict:
    """Pass-through with dataQuality marker."""
    out = dict(row)
    out["dataQuality"] = "full"
    return out


# ── Main build ───────────────────────────────────────────────────────────────
def build_matcher_vehicles(
    summary_path:    Path = SUMMARY_IN,
    us_catalog_path: Path = US_CATALOG_IN,
    evdb_path:       Path = EVDB_IN,
    max_count:       int  = 300,
) -> list[dict]:
    """
    Merge three tiers and de-dupe by id and normalized make+model:
      Tier 1   — curated vehicles_summary.json          (dataQuality "full")
      Tier 2a  — us_ev_catalog.json (fueleconomy.gov)   (preferred — US EPA specs)
      Tier 2b  — ev_database.json (ev-database.org, EU) (last-resort fill)
    Earlier tiers always win when a model collides.
    """
    summary    = json.loads(summary_path.read_text("utf-8")) if summary_path.exists() else []
    us_catalog = json.loads(us_catalog_path.read_text("utf-8")) if us_catalog_path.exists() else {}
    evdb       = json.loads(evdb_path.read_text("utf-8")) if evdb_path.exists() else {}

    # Honor the catalog's discontinued-model kill rules across ALL tiers (curated
    # summary included), so dropping a model is a one-line edit in one place.
    try:
        from scrapers.us_ev_catalog_scraper import _is_discontinued
    except Exception:  # pragma: no cover
        def _is_discontinued(make, model, year):  # type: ignore
            return False

    def _discontinued(entry: dict) -> bool:
        try:
            return _is_discontinued(entry.get("make", ""), entry.get("model", ""),
                                    int(entry.get("year") or 0))
        except Exception:
            return False

    seen_ids:  set[str] = set()
    seen_keys: set[str] = set()
    out: list[dict] = []

    def _claim(entry: dict) -> bool:
        """Register an entry's id + normalized key; False if already seen/dropped."""
        if _discontinued(entry):
            return False
        nkey = _norm_key(entry.get("make", ""), entry.get("model", ""))
        if entry["id"] in seen_ids or nkey in seen_keys:
            return False
        seen_ids.add(entry["id"])
        seen_keys.add(nkey)
        return True

    # ── Tier 1 — curated first ───────────────────────────────────────────────
    for v in summary:
        entry = from_summary_row(v)
        if _claim(entry):
            out.append(entry)

    # ── Tier 2a — US EPA catalog (preferred). current → upcoming → recent ─────
    us_rows = us_catalog.get("vehicles", [])
    status_rank = {"current": 0, "upcoming": 1, "recent": 2}
    us_rows = sorted(us_rows, key=lambda r: (status_rank.get(r.get("status"), 3),
                                             -(r.get("range_mi") or 0)))
    for row in us_rows:
        if len(out) >= max_count:
            break
        entry = from_us_catalog_row(row)
        if entry and _claim(entry):
            out.append(entry)

    # ── Tier 2b — EU ev-database fallback: DISABLED ──────────────────────────
    # The ev-database.org catalog is European: it lists trim-level rows as
    # separate models ("IONIQ 6 84 kWh AWD"), carries WLTP-ish ranges, and prices
    # in EUR/GBP. That produced duplicate cards, wrong "up to X mi" figures, and
    # odd trim labels. For a US-only site the EPA catalog (Tier 2a) is both
    # authoritative and complete enough, so we no longer fold EU rows in.
    # (from_evdb_row is retained for reference but intentionally unused.)
    _ = evdb  # keep the loaded file reference without injecting its rows

    return out


def write_matcher_vehicles(vehicles: list[dict], out_path: Path = OUT_PATH, dry_run: bool = False) -> dict:
    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "tierCounts": {
            "full":      sum(1 for v in vehicles if v.get("dataQuality") == "full"),
            "estimated": sum(1 for v in vehicles if v.get("dataQuality") == "estimated"),
        },
        "sourceCounts": {
            "curated": sum(1 for v in vehicles if v.get("dataQuality") == "full"),
            "us_epa":  sum(1 for v in vehicles if v.get("dataSource") == "us_epa"),
            "ev_database_eu": sum(1 for v in vehicles
                                  if v.get("dataQuality") == "estimated"
                                  and v.get("dataSource") != "us_epa"),
        },
        "total":   len(vehicles),
        "vehicles": vehicles,
    }
    if dry_run:
        return payload
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def _main():
    parser = argparse.ArgumentParser(description="Build matcher_vehicles.json")
    parser.add_argument("--max", type=int, default=300, help="Max vehicles in output (default 300)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    vehicles = build_matcher_vehicles(max_count=args.max)
    payload = write_matcher_vehicles(vehicles, dry_run=args.dry_run)
    print(json.dumps({
        "total":     payload["total"],
        "fullTier":  payload["tierCounts"]["full"],
        "estimated": payload["tierCounts"]["estimated"],
        "out":       str(OUT_PATH),
        "dryRun":    args.dry_run,
    }, indent=2))


if __name__ == "__main__":
    _main()
