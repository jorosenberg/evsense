"""
detail_trim_sync.py — Correct each vehicle's trims from the EPA catalog.

WHY
---
The per-vehicle detail files (frontend/public/data/vehicles/{id}.json) drive the
detail-page trim picker, header range, and the calculator. Their trim ranges and
drivetrain labels were hand-entered and drift out of date (e.g. the Model 3 was
missing its Long Range/Premium RWD trim and showed the base trim's range as the
headline). fueleconomy.gov (us_ev_catalog.json) has authoritative US EPA range,
efficiency, and drivetrain for every trim, so we use it as the source of truth
for those NUMBERS while preserving all the hand-curated content (marketing trim
names, MSRP, colors, lease/finance offers, images, warranty, etc.).

WHAT IT DOES, per detail file
-----------------------------
1. Find the matching EPA model in us_ev_catalog.json (by normalized make+model).
2. For each EPA trim (the real, current trim set):
     • If a curated trim with the same drivetrain and a near range already exists,
       keep that curated trim (names/MSRP/colors/offers intact) but OVERWRITE its
       range / efficiency / horsepower with the EPA figures.
     • Otherwise add a new trim carrying the EPA numbers, named from a small
       curated override map (TRIM_NAME_OVERRIDES) or a readable default.
3. Keep any curated trim the EPA data doesn't cover (never silently drop curation).
4. Recompute the top-level headline range = the longest trim range (fixes the
   "up to X mi" figure), and mirror it into vehicles_summary.json for the cards.

SAFETY
------
• Only touches files that have a confident EPA make+model match; others are left
  untouched and reported as "skipped".
• --dry-run prints a per-file diff and writes nothing.

RUN
---
    python scraper/processors/detail_trim_sync.py --dry-run
    python scraper/processors/detail_trim_sync.py
    python scraper/processors/detail_trim_sync.py --only tesla-model3-2025
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
VEHICLES_DIR = DATA_DIR / "vehicles"
# Prefer the FULL catalog (every US EV) so we can find specs for any curated
# vehicle — the popularity-trimmed us_ev_catalog.json omits most models.
US_CATALOG_FULL = DATA_DIR / "us_ev_catalog_full.json"
US_CATALOG = DATA_DIR / "us_ev_catalog.json"
SUMMARY = DATA_DIR / "vehicles_summary.json"

# Range (mi) within which a curated trim and an EPA trim of the same drivetrain
# are considered "the same trim" and merged rather than duplicated.
RANGE_MATCH_TOLERANCE = 40

# Curated marketing names for trims the EPA data adds. Keyed by detail-file id →
# ordered list of rules; first rule whose drivetrain + range window matches wins.
# Extend this as needed; when no rule matches we fall back to a readable default.
TRIM_NAME_OVERRIDES: dict[str, list[dict]] = {
    "tesla-model3-2025": [
        {"drivetrain": "RWD", "min": 250, "max": 300, "name": "RWD"},
        {"drivetrain": "RWD", "min": 330, "max": 400, "name": "Premium RWD"},
        {"drivetrain": "AWD", "min": 320, "max": 360, "name": "Premium AWD"},
        {"drivetrain": "AWD", "min": 270, "max": 319, "name": "Performance AWD"},
    ],
    "tesla-modely-2025": [
        {"drivetrain": "RWD", "min": 250, "max": 340, "name": "RWD"},
        {"drivetrain": "AWD", "min": 300, "max": 340, "name": "Long Range AWD"},
        {"drivetrain": "AWD", "min": 270, "max": 299, "name": "Performance AWD"},
    ],
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _build_full_catalog_now() -> dict | None:
    """Build a full EPA catalog from the live CSV (used when no catalog file
    exists yet, e.g. running this script standalone before main.py)."""
    try:
        import sys
        sys.path.insert(0, str(SCRAPER_DIR))
        from datetime import datetime, timezone
        from scrapers.us_ev_catalog_scraper import fetch_bulk_csv, build_catalog
        cy = datetime.now(timezone.utc).year
        years = [cy - 1, cy, cy + 1]
        print("  no catalog file found — fetching fueleconomy.gov to build a full catalog ...")
        vehicles = build_catalog(fetch_bulk_csv(), years, top_per_class=None)
        return {"vehicles": vehicles}
    except Exception as e:  # noqa: BLE001
        print(f"  could not build catalog on the fly: {e}")
        return None


def _load_catalog_index() -> dict[str, dict]:
    """normalized make|model → EPA catalog model entry (with trims[])."""
    catalog_path = US_CATALOG_FULL if US_CATALOG_FULL.exists() else US_CATALOG
    if catalog_path.exists():
        data = json.loads(catalog_path.read_text("utf-8"))
    else:
        data = _build_full_catalog_now()
        if not data:
            return {}
    idx: dict[str, dict] = {}
    for v in data.get("vehicles", []):
        key = f"{_norm(v.get('make'))}|{_norm(v.get('model'))}"
        # Prefer the entry with the most trims if a key repeats across years.
        if key not in idx or len(v.get("trims", [])) > len(idx[key].get("trims", [])):
            idx[key] = v
    return idx


def _override_name(file_id: str, drivetrain: str, range_mi) -> str | None:
    for rule in TRIM_NAME_OVERRIDES.get(file_id, []):
        if rule["drivetrain"] != drivetrain:
            continue
        if range_mi is None:
            continue
        if rule["min"] <= range_mi <= rule["max"]:
            return rule["name"]
    return None


def _default_name(drivetrain: str, range_mi, idx: int) -> str:
    if range_mi:
        return f"{drivetrain} · {int(range_mi)} mi"
    return f"{drivetrain or 'Base'} {idx + 1}"


def sync_file(detail: dict, epa_model: dict, file_id: str) -> tuple[dict, list[str]]:
    """Return (updated_detail, change_notes). Pure — no disk I/O.

    NON-DESTRUCTIVE by design. The curated trim list (marketing names like
    "SEL AWD" and their MSRPs) is the source of truth for *which* trims exist and
    *what they cost* — EPA data has neither. This function ONLY corrects the
    range / efficiency / horsepower numbers on trims that already exist, by
    matching each curated trim to the nearest same-drivetrain EPA trim.

    It never adds trims, never renames them, and never touches MSRP — so it can't
    inject junk rows like "FWD · 314 mi" or blank out prices.
    """
    notes: list[str] = []
    curated = list(detail.get("trims") or [])
    if not curated:
        # Nothing to correct, and we must not invent trims from EPA data.
        return detail, []

    epa_trims = [t for t in epa_model.get("trims", []) if t.get("range_mi")]

    for ct in curated:
        dt = (ct.get("drivetrain") or "").upper()
        specs = dict(ct.get("specs") or {})
        ct_range = specs.get("range")

        # Nearest EPA trim of the same drivetrain, within tolerance.
        best, best_gap = None, None
        for et in epa_trims:
            if (et.get("drivetrain") or "").upper() != dt:
                continue
            gap = abs((et.get("range_mi") or 0) - (ct_range or 0))
            if best_gap is None or gap < best_gap:
                best_gap, best = gap, et

        if best is None or (ct_range and best_gap is not None and best_gap > RANGE_MATCH_TOLERANCE):
            continue  # no confident EPA match — leave this curated trim as-is

        rng = best.get("range_mi")
        eff = best.get("efficiency_mi_per_kwh")
        if rng and rng != ct_range:
            notes.append(f"trim '{ct.get('name')}' range {ct_range}→{rng}")
            specs["range"] = rng
        if eff:
            specs["milesPerKwh"] = eff
        ct["specs"] = specs

    detail["trims"] = curated

    # Recompute headline range = longest curated trim.
    ranges = [(t.get("specs") or {}).get("range") for t in curated]
    ranges = [r for r in ranges if r]
    if ranges:
        max_range = max(ranges)
        specs = dict(detail.get("specs") or {})
        if specs.get("range") != max_range:
            notes.append(f"headline range {specs.get('range')}→{max_range}")
        specs["range"] = max_range
        detail["specs"] = specs
        detail["_maxRange"] = max_range  # internal hint for summary sync

    return detail, notes


def clean_injected_trims(only: str | None = None, dry_run: bool = False) -> dict:
    """Undo earlier damage: remove trims that a previous sync injected from EPA
    data (tagged specsSource == 'us_epa'), which appear as bogus rows like
    'FWD · 314 mi' with null MSRP. Recomputes the headline range afterward.
    """
    report = {"cleaned": [], "untouched": [], "dryRun": dry_run}
    for fp in sorted(VEHICLES_DIR.glob("*.json")):
        file_id = fp.stem
        if only and file_id != only:
            continue
        detail = json.loads(fp.read_text("utf-8"))
        trims = detail.get("trims") or []
        kept = [t for t in trims if t.get("specsSource") != "us_epa"]
        removed = len(trims) - len(kept)
        if removed == 0:
            report["untouched"].append(file_id)
            continue
        detail["trims"] = kept
        ranges = [(t.get("specs") or {}).get("range") for t in kept]
        ranges = [r for r in ranges if r]
        if ranges:
            specs = dict(detail.get("specs") or {})
            specs["range"] = max(ranges)
            detail["specs"] = specs
        if not dry_run:
            fp.write_text(json.dumps(detail, indent=2, ensure_ascii=False), encoding="utf-8")
        report["cleaned"].append({"id": file_id, "removedTrims": removed})
    return report


def _sync_summary_range(file_id: str, max_range: int, dry_run: bool) -> bool:
    """Mirror the corrected headline range into vehicles_summary.json (the cards)."""
    if not SUMMARY.exists() or not max_range:
        return False
    rows = json.loads(SUMMARY.read_text("utf-8"))
    changed = False
    for row in rows:
        if row.get("id") == file_id and row.get("rangeEpa") != max_range:
            row["rangeEpa"] = max_range
            changed = True
    if changed and not dry_run:
        SUMMARY.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return changed


def run(only: str | None = None, dry_run: bool = False) -> dict:
    idx = _load_catalog_index()
    if not idx:
        return {"ok": False, "error": "no EPA catalog available (us_ev_catalog_full.json / us_ev_catalog.json) and could not build one — run main.py or us_ev_catalog_scraper first"}

    report = {"updated": [], "skipped": [], "dryRun": dry_run}
    files = sorted(VEHICLES_DIR.glob("*.json"))
    for fp in files:
        file_id = fp.stem
        if only and file_id != only:
            continue
        detail = json.loads(fp.read_text("utf-8"))
        key = f"{_norm(detail.get('make'))}|{_norm(detail.get('model'))}"
        epa_model = idx.get(key)
        if not epa_model:
            report["skipped"].append({"id": file_id, "reason": "no EPA make+model match"})
            continue

        updated, notes = sync_file(detail, epa_model, file_id)
        max_range = updated.pop("_maxRange", None)
        if not notes:
            report["skipped"].append({"id": file_id, "reason": "already in sync"})
            continue

        if not dry_run:
            fp.write_text(json.dumps(updated, indent=2, ensure_ascii=False), encoding="utf-8")
        if max_range:
            _sync_summary_range(file_id, max_range, dry_run)
        report["updated"].append({"id": file_id, "changes": notes})

    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync detail-file trims from the EPA catalog.")
    ap.add_argument("--only", help="Only process this detail-file id (e.g. tesla-model3-2025)")
    ap.add_argument("--dry-run", action="store_true", help="Print diffs, write nothing")
    ap.add_argument("--clean", action="store_true",
                    help="Remove EPA-injected junk trims (specsSource=us_epa) from earlier runs")
    args = ap.parse_args()

    if args.clean:
        report = clean_injected_trims(only=args.only, dry_run=args.dry_run)
        print(json.dumps(report, indent=2))
        print(f"\n{'[dry-run] would clean' if args.dry_run else 'Cleaned'} "
              f"{len(report['cleaned'])} file(s).")
        return

    report = run(only=args.only, dry_run=args.dry_run)
    print(json.dumps(report, indent=2))
    if report.get("updated"):
        print(f"\n{'[dry-run] would update' if args.dry_run else 'Updated'} "
              f"{len(report['updated'])} file(s); skipped {len(report['skipped'])}.")


if __name__ == "__main__":
    main()
