"""
nhtsa_upcoming.py — Pre-release "upcoming EV" radar via the NHTSA vPIC API.

WHY THIS EXISTS
---------------
fueleconomy.gov (see us_ev_catalog_scraper.py) is the authoritative source for
EVs *already EPA-rated*. But EPA ratings land late — often weeks before a car
goes on sale, sometimes after. To catch models *before* they show up there, we
lean on the federal vPIC database: manufacturers are legally required to register
vehicle make/model/year with NHTSA ahead of US sale, so vPIC is the earliest
public signal that a model exists.

This is an EARLY-WARNING RADAR, not a spec source. vPIC gives make + model + year
and (optionally) a fuel type — no range, battery, or price. So this module's job
is narrow: find model names for the next year(s) that look like EVs and are NOT
already in our EPA catalog, and flag them as "upcoming" candidates so the catalog
and the matcher can surface a "coming soon" card while we wait for real specs.

DATA SOURCE
-----------
vPIC REST API (free, no key, 24/7):
    GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json

vPIC has no clean "battery-electric only" filter on that endpoint, so we apply
two heuristics to keep false positives down:
    1. Only query makes that actually sell EVs in the US (EV_MAKES).
    2. Keep a model only if its name matches a known EV model (EV_MODEL_HINTS)
       or an EV-ish keyword (EV_KEYWORDS). Everything else is dropped.

WHAT IT PRODUCES
----------------
frontend/public/data/upcoming_radar.json
    {
      "source": "NHTSA vPIC",
      "scraped_at": "...",
      "model_years": [2027],
      "count": N,
      "candidates": [ { make, model, model_year, vpic_model_id,
                        already_in_catalog: bool, status: "upcoming" } ]
    }

It can also be merged into us_ev_catalog.json as lightweight status="upcoming"
rows (see merge_into_catalog) so a single file still drives the matcher.

RUN
---
    python scraper/scrapers/nhtsa_upcoming.py
    python scraper/scrapers/nhtsa_upcoming.py --years 2027 2028
    python scraper/scrapers/nhtsa_upcoming.py --merge      # also write into catalog
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

try:
    import httpx
    _HAS_HTTPX = True
except ImportError:  # pragma: no cover
    _HAS_HTTPX = False

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"
OUT_PATH = DATA_DIR / "upcoming_radar.json"
CATALOG_PATH = DATA_DIR / "us_ev_catalog.json"

VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json"
SOURCE_NAME = "NHTSA vPIC"
SOURCE_URL = "https://vpic.nhtsa.dot.gov/api/"
UA = "Mozilla/5.0 (compatible; EVsense-Scraper/1.0; NHTSA vPIC upcoming radar)"

# US makes that actively sell or have announced battery-electric models. Querying
# only these keeps us from scanning the entire 10k-make registry every night.
EV_MAKES: list[str] = [
    "Tesla", "Hyundai", "Kia", "Genesis", "Ford", "Chevrolet", "GMC",
    "Cadillac", "Rivian", "Lucid", "BMW", "Mercedes-Benz", "Audi",
    "Volkswagen", "Volvo", "Polestar", "Porsche", "Nissan", "Toyota",
    "Subaru", "Honda", "Acura", "Lexus", "Mini", "Fiat", "Jeep", "Dodge",
    "VinFast", "Scout", "Afeela",
]

# Known EV model-name fragments (lowercased). A vPIC model whose name contains one
# of these is treated as an EV candidate. Maintained alongside CURATED_US_MSRP /
# POPULARITY_RANK in us_ev_catalog_scraper.py.
EV_MODEL_HINTS: set[str] = {
    "model 3", "model y", "model s", "model x", "cybertruck",
    "ioniq", "ev6", "ev9", "ev3", "ev4", "ev5", "niro ev", "kona electric",
    "gv60", "gv70 electrified", "electrified", "g80 electrified",
    "mustang mach-e", "mach-e", "f-150 lightning", "lightning", "e-transit",
    "equinox ev", "blazer ev", "silverado ev", "bolt",
    "sierra ev", "hummer ev", "lyriq", "optiq", "vistiq", "escalade iq", "celestiq",
    "r1t", "r1s", "r2", "r3", "air", "gravity",
    "i4", "i5", "i7", "ix", "i3",
    "eqb", "eqe", "eqs", "g 580", "g-class electric", "cla",
    "q4 e-tron", "q6 e-tron", "q8 e-tron", "e-tron", "a6 e-tron", "s6 e-tron",
    "id.4", "id. buzz", "id.buzz", "id buzz",
    "ex30", "ex40", "ex90", "c40", "polestar",
    "taycan", "macan electric", "ariya", "leaf", "bz4x", "bz", "solterra",
    "prologue", "zdx", "rz", "countryman electric", "cooper electric",
    "500e", "wagoneer s", "recon", "charger daytona", "vf 8", "vf 9", "vf8", "vf9",
}

# Generic keyword fallback when a model name itself is not in the hint set.
EV_KEYWORDS: list[str] = ["electric", "ev", "e-tron", "eqs", "eqe", "eqb", "ioniq"]


def _looks_like_ev(model_name: str) -> bool:
    name = (model_name or "").lower()
    if any(h in name for h in EV_MODEL_HINTS):
        return True
    # Whole-word keyword match to avoid "Bevel" matching "ev", etc.
    tokens = re.split(r"[\s.\-]+", name)
    return any(k in tokens for k in EV_KEYWORDS) or "e-tron" in name


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _fetch_models(make: str, year: int, retries: int = 3) -> list[dict]:
    if not _HAS_HTTPX:
        raise RuntimeError("httpx not installed; cannot query vPIC")
    url = VPIC_URL.format(make=quote(make), year=year)
    headers = {"User-Agent": UA, "Accept": "application/json"}
    last_exc = None
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=30, follow_redirects=True, headers=headers) as client:
                r = client.get(url)
                r.raise_for_status()
                return r.json().get("Results", []) or []
        except Exception as e:  # noqa: BLE001
            last_exc = e
            time.sleep(1.5 * (attempt + 1))
    print(f"  [warn] vPIC fetch failed for {make} {year}: {last_exc}")
    return []


def _load_catalog_keys(catalog_path: Path) -> set[str]:
    """Normalized make|model keys already present in the EPA catalog."""
    if not catalog_path.exists():
        return set()
    try:
        data = json.loads(catalog_path.read_text("utf-8"))
    except Exception:
        return set()
    keys = set()
    for v in data.get("vehicles", []):
        keys.add(f"{_norm(v.get('make'))}|{_norm(v.get('model'))}")
    return keys


def scan(years: list[int], catalog_path: Path = CATALOG_PATH) -> list[dict]:
    """Query vPIC for the given model years and return EV candidates."""
    catalog_keys = _load_catalog_keys(catalog_path)
    seen: set[tuple[str, str, int]] = set()
    candidates: list[dict] = []

    for make in EV_MAKES:
        for year in years:
            for row in _fetch_models(make, year):
                model = (row.get("Model_Name") or "").strip()
                if not model or not _looks_like_ev(model):
                    continue
                key = (_norm(make), _norm(model), year)
                if key in seen:
                    continue
                seen.add(key)
                cat_key = f"{_norm(make)}|{_norm(model)}"
                candidates.append({
                    "make": make,
                    "model": model,
                    "model_year": year,
                    "vpic_model_id": row.get("Model_ID"),
                    "already_in_catalog": cat_key in catalog_keys,
                    "status": "upcoming",
                    "source": SOURCE_NAME,
                })
    candidates.sort(key=lambda c: (c["model_year"], c["make"].lower(), c["model"].lower()))
    return candidates


def write_radar(candidates: list[dict], years: list[int], out_path: Path = OUT_PATH) -> dict:
    payload = {
        "source": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_years": sorted(years),
        "count": len(candidates),
        "new_count": sum(1 for c in candidates if not c["already_in_catalog"]),
        "candidates": candidates,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def merge_into_catalog(candidates: list[dict], catalog_path: Path = CATALOG_PATH) -> int:
    """Add NEW (not-yet-in-catalog) candidates to us_ev_catalog.json as
    lightweight status='upcoming' rows so a single file still feeds the matcher.

    These rows carry no specs (vPIC has none); the matcher generator's class-based
    estimates fill range/MSRP and the card is flagged comingSoon. Returns the
    number of rows added.
    """
    if not catalog_path.exists():
        print("  [warn] catalog not found; run us_ev_catalog_scraper first")
        return 0
    data = json.loads(catalog_path.read_text("utf-8"))
    existing = data.get("vehicles", [])
    existing_keys = {f"{_norm(v.get('make'))}|{_norm(v.get('model'))}" for v in existing}

    added = 0
    for c in candidates:
        if c["already_in_catalog"]:
            continue
        key = f"{_norm(c['make'])}|{_norm(c['model'])}"
        if key in existing_keys:
            continue
        existing_keys.add(key)
        vid = f"us-{_norm(c['make'])}-{_norm(c['model'])}-{c['model_year']}"
        existing.append({
            "id": vid,
            "name": f"{c['make']} {c['model']}".strip(),
            "make": c["make"],
            "model": c["model"],
            "year": c["model_year"],
            "status": "upcoming",
            "sold_in_us": True,
            "body_style": "suv",          # unknown until EPA; SUV is the modal class
            "category": "suv",
            "range_mi": None,
            "efficiency_mi_per_kwh": None,
            "msrp_usd": None,
            "msrp_source": None,
            "popularity_score": 25,        # below established models, above noise
            "trim_count": 0,
            "trims": [],
            "image_url": "",
            "source": f"{SOURCE_NAME} (pre-release radar)",
            "needs_specs": True,           # flag for a later spec backfill pass
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
        added += 1

    data["vehicles"] = existing
    data["upcoming_count"] = sum(1 for v in existing if v.get("status") == "upcoming")
    data["count"] = len(existing)
    catalog_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return added


def main() -> None:
    ap = argparse.ArgumentParser(description="NHTSA vPIC upcoming-EV radar.")
    ap.add_argument("--years", type=int, nargs="*", default=None,
                    help="Model years to scan (default: current+1, current+2)")
    ap.add_argument("--merge", action="store_true",
                    help="Also merge new candidates into us_ev_catalog.json")
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    if args.years:
        years = args.years
    else:
        cy = datetime.now(timezone.utc).year
        years = [cy + 1, cy + 2]

    print(f"Scanning NHTSA vPIC for upcoming EVs, model years {years} ...")
    candidates = scan(years)
    payload = write_radar(candidates, years, out_path=Path(args.out))
    print(f"Wrote {args.out}")
    print(f"  candidates={payload['count']}  new(not in catalog)={payload['new_count']}")

    if args.merge:
        added = merge_into_catalog(candidates)
        print(f"  merged {added} new upcoming rows into {CATALOG_PATH.name}")


if __name__ == "__main__":
    main()
