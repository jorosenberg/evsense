"""
us_ev_catalog_scraper.py — Authoritative US-market EV catalog.

WHY THIS EXISTS
---------------
The existing `ev_database_scraper.py` scrapes ev-database.org, which is a
*European* catalog: prices are in EUR/GBP and converted to USD with a flat FX
rate, ranges are WLTP, and it lists plenty of models never sold in the US.

This scraper pulls from the **US EPA / DOE fueleconomy.gov dataset** — the
canonical, government-maintained list of every vehicle *sold in the United
States*, with EPA-rated range and efficiency. It answers the exact question
the product needs:

    "Every new EV on sale in the US right now, plus the ones arriving this
     model year and next."

By definition every row here is a US-market vehicle with EPA-rated specs, so
no currency conversion and no "is this even sold here?" guessing.

DATA SOURCE
-----------
fueleconomy.gov publishes a single bulk CSV of every vehicle it has ever
rated (~50k rows, ~21 MB). One download replaces tens of thousands of menu
API calls. We filter to:
    atvType == "EV"                 (battery-electric only; excludes PHEV/HEV)
    year in [current-1 .. current+1]  (still-on-sale, current, upcoming)

WHAT IT PRODUCES
----------------
frontend/public/data/us_ev_catalog.json

    {
      "source": "fueleconomy.gov (US EPA/DOE)",
      "scraped_at": "...",
      "year_window": [2025, 2026, 2027],
      "count": N,
      "current_count": ..., "upcoming_count": ..., "recent_count": ...,
      "vehicles": [ { ...model-grouped entry with trims[]... } ]
    }

Each EPA row is a model+trim+wheel-size combination. We group rows by
(make, baseModel, year) into one model entry and collapse the trim variants
(deduping cosmetic "(19 inch wheels)" splits) into a `trims` list.

MSRP
----
fueleconomy.gov does NOT carry pricing. We attach a curated starting MSRP for
the mainstream US EV market (see CURATED_US_MSRP). Models without a curated
price get msrp_usd = null and msrp_source = null — the matcher generator can
still fall back to a class-based estimate, and the calculator always lets the
user override with their own price.

RUN
---
    python scraper/scrapers/us_ev_catalog_scraper.py
    python scraper/scrapers/us_ev_catalog_scraper.py --years 2025 2026 2027
    python scraper/scrapers/us_ev_catalog_scraper.py --cached-csv vehicles.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:  # pragma: no cover - allow --cached-csv without httpx
    _HAS_HTTPX = False

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "us_ev_catalog.json"

# Bulk dataset of every EPA-rated vehicle. Single file, refreshed by EPA.
BULK_CSV_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv"
SOURCE_NAME = "fueleconomy.gov (US EPA/DOE)"
SOURCE_URL = "https://www.fueleconomy.gov/feg/download.shtml"
UA = "Mozilla/5.0 (compatible; EVsense-Scraper/1.0; US EV catalog import)"

KW_TO_HP = 1.34102


# ── Curated starting MSRPs ($USD, base trim) ─────────────────────────────────
# fueleconomy.gov has no pricing, so we layer on a hand-maintained map of the
# mainstream US EV market. Keyed by make (lowercased) → list of
# (model substring, base MSRP). First substring match wins, so order the more
# specific substrings first. Update these on the same monthly cadence as the
# rest of the pipeline.
CURATED_US_MSRP: dict[str, list[tuple[str, int]]] = {
    "tesla": [
        ("model 3", 38990), ("model y", 44990), ("model s", 74990),
        ("model x", 79990), ("cybertruck", 69990),
    ],
    "hyundai": [
        ("ioniq 5 n", 66200), ("ioniq 5", 41450), ("ioniq 6", 38615),
        ("ioniq 9", 58955), ("kona", 32675),
    ],
    "kia": [
        ("ev6", 42600), ("ev9", 54900), ("ev3", 35000), ("niro", 39600),
    ],
    "ford": [
        ("mustang mach-e", 42995), ("f-150 lightning", 49995),
        ("e-transit", 51000),
    ],
    "chevrolet": [
        ("equinox", 34995), ("blazer", 44600), ("silverado", 57095),
        ("bolt", 30000),
    ],
    "gmc": [
        ("hummer", 96550), ("sierra", 90000),
    ],
    "cadillac": [
        ("lyriq", 58590), ("optiq", 54000), ("vistiq", 78000),
        ("escalade iq", 130000), ("celestiq", 340000),
    ],
    "rivian": [
        ("r1t", 69900), ("r1s", 75900), ("r2", 45000),
    ],
    "bmw": [
        ("i4", 52200), ("i5", 67900), ("i7", 105700), ("ix", 87250),
    ],
    "mercedes-benz": [
        ("cla", 52000), ("eqb", 54300), ("eqe suv", 79050), ("eqe", 76050),
        ("eqs suv", 105550), ("eqs", 104400), ("g 580", 160000),
    ],
    "audi": [
        ("q4", 50100), ("q6", 63800), ("q8", 74400), ("e-tron gt", 106500),
    ],
    "volkswagen": [
        ("id.4", 45095), ("id.buzz", 61545), ("id. buzz", 61545),
    ],
    "nissan": [
        ("ariya", 39590), ("leaf", 28140),
    ],
    "toyota": [
        ("bz4x", 37070), ("bz", 37070),
    ],
    "subaru": [
        ("solterra", 38495),
    ],
    "honda": [
        ("prologue", 47400),
    ],
    "acura": [
        ("zdx", 64500),
    ],
    "lexus": [
        ("rz", 43975),
    ],
    "volvo": [
        ("ex30", 44900), ("ex40", 53000), ("c40", 53000), ("ex90", 80000),
    ],
    "polestar": [
        ("polestar 2", 51300), ("polestar 3", 67500), ("polestar 4", 56700),
        ("2", 51300), ("3", 67500), ("4", 56700),
    ],
    "genesis": [
        ("gv60", 52000), ("gv70", 66950), ("g80", 75000),
    ],
    "lucid": [
        ("gravity", 79900), ("air", 69900),
    ],
    "porsche": [
        ("taycan", 99400), ("macan", 75300),
    ],
    "mini": [
        ("countryman", 45000), ("cooper", 30900), ("hardtop", 30900),
    ],
    "fiat": [
        ("500e", 32500), ("500", 32500),
    ],
    "vinfast": [
        ("vf 8", 47200), ("vf8", 47200), ("vf 9", 57000), ("vf9", 57000),
    ],
    "jeep": [
        ("wagoneer s", 65000), ("recon", 60000),
    ],
    "dodge": [
        ("charger", 59595),
    ],
}


# ── Popularity ranking ────────────────────────────────────────────────────────
# fueleconomy.gov lists EVERY US-certified EV, including low-volume and fleet-only
# models the product doesn't need. We don't want "every EV", just the most popular
# per class. There is no sales-volume field in the EPA data, so we seed a curated
# popularity weight from two grounded signals:
#   1. Edmunds "Best Electric Cars of 2026 and 2027" class rankings
#      (https://www.edmunds.com/electric-car/) — editorial pick order per class.
#   2. Known 2024–2025 US BEV sales leaders.
# Higher weight = more popular. Keyed by normalized "make|model" (alphanumerics
# only, lowercased). Models absent from the map get DEFAULT_POPULARITY, so a brand
# new model still competes — it just won't outrank an established sales leader.
# Update this map on the same monthly cadence as CURATED_US_MSRP.
DEFAULT_POPULARITY = 30

POPULARITY_RANK: dict[str, int] = {
    # ── Mainstream sedans / hatch ──
    "tesla|model3": 100, "hyundai|ioniq6": 78, "nissan|leaf": 70,
    "tesla|models": 60,
    # ── Mainstream small/compact SUVs (highest-volume class) ──
    "tesla|modely": 99, "hyundai|ioniq5": 92, "kia|ev6": 84,
    "chevrolet|equinox": 80, "ford|mustangmache": 82, "volkswagen|id4": 74,
    "chevrolet|blazer": 66, "nissan|ariya": 62, "subaru|solterra": 50,
    "toyota|bz4x": 52, "toyota|bz": 52, "honda|prologue": 58, "kia|niro": 48,
    "kia|ev3": 46, "hyundai|kona": 48,
    # ── Midsize / 3-row SUVs ──
    "hyundai|ioniq9": 72, "kia|ev9": 76, "tesla|modelx": 58,
    # ── Trucks ──
    "ford|f150lightning": 86, "rivian|r1t": 80, "chevrolet|silverado": 64,
    "gmc|sierra": 60, "gmc|hummer": 50, "tesla|cybertruck": 75,
    # ── Vans ──
    "volkswagen|idbuzz": 70, "ford|etransit": 56,
    # ── Luxury sedans / cars ──
    "lucid|air": 66, "bmw|i4": 70, "bmw|i5": 64, "bmw|i7": 50,
    "audi|a6sportbacketron": 60, "audi|a6etron": 60, "audi|etrongt": 52,
    "porsche|taycan": 56, "mercedesbenz|eqe": 54, "mercedesbenz|eqs": 50,
    "mercedesbenz|cla": 56,
    # ── Luxury SUVs ──
    "rivian|r1s": 78, "cadillac|lyriq": 74, "bmw|ix": 68,
    "genesis|gv60": 56, "genesis|electrifiedgv70": 56, "genesis|gv70": 56,
    "volvo|ex40": 54, "volvo|ex30": 58, "volvo|ex90": 52, "volvo|c40": 50,
    "mercedesbenz|eqesuv": 60, "mercedesbenz|eqssuv": 52,
    "audi|q4": 64, "audi|q6": 58, "audi|q8": 50,
    "cadillac|optiq": 58, "cadillac|vistiq": 52, "cadillac|escaladeiq": 54,
    "porsche|macan": 60, "acura|zdx": 50, "lexus|rz": 52,
    "genesis|g80": 44, "polestar|polestar2": 56, "polestar|polestar3": 50,
    "polestar|polestar4": 52, "honda|prologue": 58,
}


# ── Discontinued / dropped-from-US-lineup models ─────────────────────────────
# fueleconomy.gov keeps rating a model for the years it was certified, so a car
# that has been pulled from the US lineup can linger in the catalog. Maintain
# explicit kill rules here. Keyed by normalized "make|model" → the FIRST model
# year that is no longer sold new in the US; rows with year >= that are dropped.
# (Earlier years stay, since they're still on dealer lots / used.)
#   • hyundai|ioniq6 → 2000: the standard Ioniq 6 is no longer a US-market model
#     (Hyundai now sells only the limited Ioniq 6 N here). We drop it entirely for
#     this US-only site. The Ioniq 6 N normalizes to "ioniq6n" and is unaffected.
DISCONTINUED_FROM_YEAR: dict[str, int] = {
    "hyundai|ioniq6": 2000,
}


def _is_discontinued(make: str, model: str, year: int) -> bool:
    cutoff = DISCONTINUED_FROM_YEAR.get(_norm_make_model(make, model))
    return cutoff is not None and year >= cutoff


def _popularity(make: str, model: str) -> int:
    return POPULARITY_RANK.get(_norm_make_model(make, model), DEFAULT_POPULARITY)


def _norm_make_model(make: str, model: str) -> str:
    m = re.sub(r"[^a-z0-9]+", "", (make or "").lower())
    md = re.sub(r"[^a-z0-9]+", "", (model or "").lower())
    return f"{m}|{md}"


# ── VClass → frontend body style / category ──────────────────────────────────
def _body_style(vclass: str) -> str:
    v = (vclass or "").lower()
    if "pickup" in v:
        return "truck"
    if "sport utility" in v or "special purpose" in v:
        return "suv"
    if "minivan" in v or "van" in v:
        return "van"
    if "station wagon" in v or "wagon" in v:
        return "wagon"
    if "two seater" in v:
        return "coupe"
    # Subcompact / Compact / Midsize / Large / Minicompact Cars
    return "sedan"


def _seat_estimate(vclass: str) -> int:
    v = (vclass or "").lower()
    if "two seater" in v:
        return 2
    if "minivan" in v or "van" in v:
        return 7
    if "standard sport utility" in v or "pickup" in v:
        return 5
    return 5


def _drivetrain(drive: str) -> str:
    d = (drive or "").lower()
    if "all-wheel" in d or "4-wheel" in d:
        return "AWD"
    if "front" in d:
        return "FWD"
    if "rear" in d:
        return "RWD"
    return "AWD"


def _motor_kw(ev_motor: str) -> float | None:
    """Sum the kW figures in an EPA evMotor string.

    "250 kW EESM"            -> 250
    "190 and 230 kW EESM"    -> 420  (dual motor, total system power)
    "140 and 280 kW PMSM..." -> 420
    """
    if not ev_motor or "kw" not in ev_motor.lower():
        return None
    # Grab every number that appears before the "kW" token. A dual-motor string
    # like "190 and 230 kW EESM" lists per-axle power; their sum is total system
    # power, which is what shoppers compare.
    before_kw = re.split(r"kw", ev_motor, maxsplit=1, flags=re.IGNORECASE)[0]
    kws = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", before_kw)]
    return round(sum(kws), 1) if kws else None


def _slug(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _num(s) -> float | None:
    try:
        if s is None or s == "":
            return None
        return float(s)
    except (TypeError, ValueError):
        return None


def _trim_name(model: str, base_model: str) -> str:
    """Derive a human trim label from the full EPA model string."""
    name = model or ""
    # Drop cosmetic wheel-size parentheticals. Covers every notation EPA uses:
    #   "(19 inch Wheels)", "(20in)", "(22 in)", "(20in AT)", "(21/22 inch wheels)"
    name = re.sub(r"\([^)]*\bwheel[s]?\b[^)]*\)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\([^)]*\binch\b[^)]*\)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\(\s*\d+\s*(?:/\s*\d+\s*)?in\b[^)]*\)", "", name, flags=re.IGNORECASE)
    # Strip the base-model tokens from the front when present
    if base_model and name.lower().startswith(base_model.lower()):
        name = name[len(base_model):]
    name = re.sub(r"\s+", " ", name).strip(" -")
    return name or "Base"


def _curated_msrp(make: str, base_model: str) -> int | None:
    entries = CURATED_US_MSRP.get((make or "").lower().strip())
    if not entries:
        return None
    bm = (base_model or "").lower()
    for substring, price in entries:
        if substring in bm:
            return price
    return None


def _msrp_class_estimate(body_style: str, range_mi: float | None, motor_kw: float | None) -> int:
    """Rough US starting-MSRP estimate when no curated price exists.

    Deliberately conservative and clearly flagged as an estimate downstream.
    Anchored on body style, nudged up for long range and high power.
    """
    base = {
        "sedan": 42000, "coupe": 60000, "wagon": 48000,
        "suv": 50000, "truck": 62000, "van": 58000,
    }.get(body_style, 46000)
    if range_mi and range_mi >= 320:
        base += 6000
    elif range_mi and range_mi < 230:
        base -= 4000
    if motor_kw and motor_kw >= 400:
        base += 12000
    return int(round(base / 500) * 500)


# ── CSV fetch ────────────────────────────────────────────────────────────────
def fetch_bulk_csv(retries: int = 3) -> str:
    if not _HAS_HTTPX:
        raise RuntimeError("httpx not installed; pass --cached-csv to use a local file")
    headers = {"User-Agent": UA, "Accept": "text/csv,*/*"}
    last_exc = None
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=90, follow_redirects=True, headers=headers) as client:
                r = client.get(BULK_CSV_URL)
                r.raise_for_status()
                return r.text
        except Exception as e:  # noqa: BLE001
            last_exc = e
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {BULK_CSV_URL}: {last_exc}")


# ── Core build ───────────────────────────────────────────────────────────────
def select_popular_per_class(
    vehicles: list[dict],
    top_per_class: int = 4,
    keep_all_upcoming: bool = True,
) -> list[dict]:
    """Trim a full EPA catalog down to the most popular models per body class.

    The product only needs the headline EVs in each class, not every certified
    model. We rank within each body_style by popularity_score (Edmunds class
    rankings + known US sales leaders, see POPULARITY_RANK) and keep the top N.

    Upcoming models are kept regardless when keep_all_upcoming=True — they are the
    whole point of the pre-release radar, and excluding a brand-new model because
    it has no sales history yet would defeat that.
    """
    if top_per_class <= 0:
        return vehicles

    kept: list[dict] = []
    per_class: dict[str, int] = {}
    # Most popular first; ties broken by longer range then priced-over-unpriced.
    ranked = sorted(
        vehicles,
        key=lambda v: (
            -(v.get("popularity_score") or 0),
            -(v.get("range_mi") or 0),
            0 if v.get("msrp_usd") else 1,
        ),
    )
    for v in ranked:
        if keep_all_upcoming and v.get("status") == "upcoming":
            kept.append(v)
            continue
        cls = v.get("body_style") or "other"
        if per_class.get(cls, 0) < top_per_class:
            per_class[cls] = per_class.get(cls, 0) + 1
            kept.append(v)
    return kept


def build_catalog(
    csv_text: str,
    years: list[int],
    top_per_class: int | None = None,
) -> list[dict]:
    current_year = datetime.now(timezone.utc).year
    year_strs = {str(y) for y in years}

    rows = list(csv.DictReader(io.StringIO(csv_text)))
    ev_rows = [
        r for r in rows
        if r.get("atvType") == "EV" and r.get("year") in year_strs
    ]

    # Group EPA rows by (make, baseModel, year)
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for r in ev_rows:
        key = (r.get("make", "").strip(), r.get("baseModel", "").strip(), r.get("year", "").strip())
        groups.setdefault(key, []).append(r)

    out: list[dict] = []
    for (make, base_model, year_str), members in groups.items():
        year = int(year_str)
        # Skip models pulled from the US lineup for this year onward.
        if _is_discontinued(make, base_model, year):
            continue
        # Build trims, de-duping cosmetic wheel-size splits (keep longest range).
        trims_by_name: dict[str, dict] = {}
        drivetrains: set[str] = set()
        for m in members:
            range_mi = _num(m.get("range"))
            comb_e = _num(m.get("combE"))  # kWh per 100 mi (from wall)
            eff = round(100.0 / comb_e, 2) if comb_e else None
            dt = _drivetrain(m.get("drive", ""))
            drivetrains.add(dt)
            motor_kw = _motor_kw(m.get("evMotor", ""))
            tname = _trim_name(m.get("model", ""), base_model)
            trim = {
                "name": tname,
                "epaVehicleId": int(_num(m.get("id")) or 0) or None,
                "drivetrain": dt,
                "range_mi": int(range_mi) if range_mi else None,
                "range_city_mi": int(_num(m.get("rangeCity"))) if _num(m.get("rangeCity")) else None,
                "range_hwy_mi": int(_num(m.get("rangeHwy"))) if _num(m.get("rangeHwy")) else None,
                "efficiency_mi_per_kwh": eff,
                "comb_mpge": int(_num(m.get("comb08"))) if _num(m.get("comb08")) else None,
                "city_mpge": int(_num(m.get("city08"))) if _num(m.get("city08")) else None,
                "hwy_mpge": int(_num(m.get("highway08"))) if _num(m.get("highway08")) else None,
                "motor_power_kw": motor_kw,
                "horsepower_est": int(round(motor_kw * KW_TO_HP)) if motor_kw else None,
            }
            prev = trims_by_name.get(tname)
            if prev is None or (trim["range_mi"] or 0) > (prev["range_mi"] or 0):
                trims_by_name[tname] = trim

        trims = sorted(trims_by_name.values(), key=lambda t: (t["range_mi"] or 0))
        ranges = [t["range_mi"] for t in trims if t["range_mi"]]
        effs = [t["efficiency_mi_per_kwh"] for t in trims if t["efficiency_mi_per_kwh"]]
        motors = [t["motor_power_kw"] for t in trims if t["motor_power_kw"]]
        vclass = members[0].get("VClass", "")
        body_style = _body_style(vclass)

        range_max = max(ranges) if ranges else None
        range_min = min(ranges) if ranges else None
        # Headline efficiency = efficiency of the longest-range trim.
        headline_eff = None
        if trims:
            top = max(trims, key=lambda t: (t["range_mi"] or 0))
            headline_eff = top["efficiency_mi_per_kwh"]
        motor_kw_max = max(motors) if motors else None

        # Rough battery estimate from EPA wall-energy * range (clearly flagged).
        battery_est = None
        if range_max and headline_eff:
            usable = range_max / headline_eff           # kWh at the wall
            battery_est = round(usable * 0.90, 1)        # ~ usable pack capacity

        msrp = _curated_msrp(make, base_model)
        msrp_source = "curated" if msrp else None

        if year > current_year:
            status = "upcoming"
        elif year == current_year:
            status = "current"
        else:
            status = "recent"

        vid = f"us-{_slug(make)}-{_slug(base_model)}-{year}"
        out.append({
            "id": vid,
            "name": f"{make} {base_model}".strip(),
            "make": make,
            "model": base_model,
            "year": year,
            "status": status,                       # current | upcoming | recent
            "sold_in_us": True,
            "body_style": body_style,
            "category": body_style if body_style in ("sedan", "suv", "truck") else "sedan",
            "vclass": vclass,
            "seat_count": _seat_estimate(vclass),
            "drivetrains": sorted(drivetrains),

            "range_mi": range_max,
            "range_min_mi": range_min,
            "efficiency_mi_per_kwh": headline_eff,
            "battery_kwh_estimate": battery_est,
            "motor_power_kw": motor_kw_max,
            "horsepower_est": int(round(motor_kw_max * KW_TO_HP)) if motor_kw_max else None,

            "msrp_usd": msrp,
            "msrp_source": msrp_source,

            "popularity_score": _popularity(make, base_model),

            "trim_count": len(trims),
            "trims": trims,

            "image_url": "",                         # EPA has no images; filled by image_pipeline
            "source": SOURCE_NAME,
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })

    # US-available current/upcoming first, then by make/model
    status_rank = {"current": 0, "upcoming": 1, "recent": 2}
    out.sort(key=lambda r: (status_rank.get(r["status"], 3),
                            (r.get("make") or "").lower(),
                            (r.get("model") or "").lower()))

    # Optionally trim to the most popular models per class (most popular EVs only).
    if top_per_class is not None:
        out = select_popular_per_class(out, top_per_class=top_per_class)
        out.sort(key=lambda r: (status_rank.get(r["status"], 3),
                                (r.get("make") or "").lower(),
                                (r.get("model") or "").lower()))
    return out


def write_catalog(vehicles: list[dict], years: list[int], out_path: Path = OUT_PATH) -> dict:
    payload = {
        "source": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "year_window": sorted(years),
        "count": len(vehicles),
        "current_count": sum(1 for v in vehicles if v["status"] == "current"),
        "upcoming_count": sum(1 for v in vehicles if v["status"] == "upcoming"),
        "recent_count": sum(1 for v in vehicles if v["status"] == "recent"),
        "priced_count": sum(1 for v in vehicles if v.get("msrp_usd")),
        "vehicles": vehicles,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape the US EV catalog from fueleconomy.gov (EPA/DOE).")
    ap.add_argument("--out", default=str(OUT_PATH), help="Output JSON path")
    ap.add_argument("--cached-csv", help="Path to a saved vehicles.csv (skip network)")
    ap.add_argument("--years", type=int, nargs="*", default=None,
                    help="Model years to include (default: current-1, current, current+1)")
    ap.add_argument("--top-per-class", type=int, default=4,
                    help="Keep only the N most popular models per body class "
                         "(all upcoming models are always kept). 0 = keep every EV.")
    args = ap.parse_args()

    if args.years:
        years = args.years
    else:
        cy = datetime.now(timezone.utc).year
        years = [cy - 1, cy, cy + 1]

    if args.cached_csv:
        csv_text = Path(args.cached_csv).read_text(encoding="utf-8", errors="replace")
        print(f"Loaded cached CSV ({len(csv_text):,} bytes)")
    else:
        print(f"Fetching {BULK_CSV_URL} ...")
        csv_text = fetch_bulk_csv()
        print(f"  ok ({len(csv_text):,} bytes)")

    top_per_class = args.top_per_class if args.top_per_class and args.top_per_class > 0 else None
    print(f"Building US EV catalog for years {years} "
          f"(top_per_class={top_per_class or 'all'}) ...")
    vehicles = build_catalog(csv_text, years, top_per_class=top_per_class)
    payload = write_catalog(vehicles, years, out_path=Path(args.out))

    print(f"Wrote {args.out}")
    print(f"  total={payload['count']}  current={payload['current_count']}  "
          f"upcoming={payload['upcoming_count']}  recent={payload['recent_count']}  "
          f"priced={payload['priced_count']}")


if __name__ == "__main__":
    main()
