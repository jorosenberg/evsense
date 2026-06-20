"""
apply_overrides.py — Apply manual YAML overrides over scraped data.

Reads scraper/overrides/vehicle_overrides.yaml and applies it AFTER scraping, so
your hand-entered values always win:
  • scores  → merged into frontend/public/data/vehicle_scores.json (override wins)
  • trims   → replace the trim list in frontend/public/data/vehicles/<id>.json,
              dropping trims with no MSRP (hideUnpricedTrims), and recomputing the
              headline range; the min priced MSRP + max range are mirrored into
              vehicles_summary.json so Browse cards stay correct.

Everything you don't set is left untouched, so the rest of the pipeline (EPA
catalog, NHTSA radar, incentives, GCC scores) is unaffected.

Field reference: scraper/overrides/OVERRIDES_REFERENCE.md

RUN
---
    python scraper/processors/apply_overrides.py
    python scraper/processors/apply_overrides.py --dry-run
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
SCORES_PATH = DATA_DIR / "vehicle_scores.json"
SUMMARY_PATH = DATA_DIR / "vehicles_summary.json"
OVERRIDES_PATH = SCRAPER_DIR / "overrides" / "vehicle_overrides.yaml"

_TRIM_SPEC_KEYS = ("range", "batteryKwh", "milesPerKwh", "zeroToSixty", "horsepower")


def _strip_year(vid: str) -> str:
    """Drop a trailing -YYYY slug so ids match regardless of the year suffix."""
    return re.sub(r"-(?:19|20)\d{2}$", "", vid or "")


def _load_yaml(path: Path) -> dict:
    try:
        import yaml  # type: ignore
    except ImportError as e:
        raise RuntimeError("PyYAML not installed. Run: pip install pyyaml") from e
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text("utf-8")) or {}


def _to_detail_trim(t: dict) -> dict:
    specs = {k: t[k] for k in _TRIM_SPEC_KEYS if t.get(k) is not None}
    return {
        "name": t.get("name"),
        "msrp": t.get("msrp"),
        "destinationFee": t.get("destinationFee"),
        "drivetrain": t.get("drivetrain"),
        "specs": specs,
        "availableColors": [],
        "cashOffers": [],
        "financeOffers": [],
        "leaseOffers": [],
        "overrideSource": "manual",
    }


def run(dry_run: bool = False) -> dict:
    data = _load_yaml(OVERRIDES_PATH)
    vehicles_ov = (data.get("vehicles") or {})
    default_hide = bool((data.get("defaults") or {}).get("hideUnpricedTrims", True))

    scores = {"vehicles": {}}
    if SCORES_PATH.exists():
        try:
            scores = json.loads(SCORES_PATH.read_text("utf-8"))
            scores.setdefault("vehicles", {})
        except Exception:
            scores = {"vehicles": {}}

    summary = []
    if SUMMARY_PATH.exists():
        summary = json.loads(SUMMARY_PATH.read_text("utf-8"))
    summary_by_id = {r.get("id"): r for r in summary}

    # Year-insensitive id resolution: a vehicle's id carries a trailing -YYYY slug
    # (e.g. bmw-i4-2025) that isn't necessarily the model year, so an override
    # keyed bmw-i4-2026 still resolves to the bmw-i4-2025 vehicle. Exact id wins.
    base_to_id = {}
    for r in summary:
        base_to_id.setdefault(_strip_year(r.get("id", "")), r.get("id"))

    def _resolve(key: str) -> str:
        if key in summary_by_id:
            return key
        return base_to_id.get(_strip_year(key), key)

    report = {"scoresUpdated": [], "trimsUpdated": [], "skipped": [], "unmatched": [], "dryRun": dry_run}

    for raw_vid, ov in vehicles_ov.items():
        if not ov:  # `{}` → no override
            report["skipped"].append(raw_vid)
            continue
        vid = _resolve(raw_vid)
        if vid not in summary_by_id and not (VEHICLES_DIR / f"{vid}.json").exists():
            report["unmatched"].append(raw_vid)
            continue
        hide = bool(ov.get("hideUnpricedTrims", default_hide))

        # ── scores (override wins) ──
        sc = {k: v for k, v in (ov.get("scores") or {}).items() if v is not None}
        if sc:
            rec = scores["vehicles"].setdefault(vid, {})
            rec.update(sc)
            rec["source"] = "override"
            report["scoresUpdated"].append({"id": vid, "scores": sc})

        # ── trims (replace, drop unpriced) ──
        if "trims" in ov:
            built = [_to_detail_trim(t) for t in (ov.get("trims") or [])]
            if hide:
                built = [t for t in built if t.get("msrp")]
            ranges = [t["specs"].get("range") for t in built if t["specs"].get("range")]
            priced = [t["msrp"] for t in built if t.get("msrp")]

            detail_path = VEHICLES_DIR / f"{vid}.json"
            if detail_path.exists():
                detail = json.loads(detail_path.read_text("utf-8"))
                detail["trims"] = built
                if ranges:
                    detail.setdefault("specs", {})["range"] = max(ranges)
                if not dry_run:
                    detail_path.write_text(json.dumps(detail, indent=2, ensure_ascii=False), encoding="utf-8")

            # mirror headline price/range into the summary card
            row = summary_by_id.get(vid)
            if row:
                if priced:
                    row["msrpFrom"] = min(priced)
                if ranges:
                    row["rangeEpa"] = max(ranges)
            report["trimsUpdated"].append({"id": vid, "trims": len(built),
                                           "dropped": len(ov.get("trims") or []) - len(built)})

    if not dry_run:
        SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
        SCORES_PATH.write_text(json.dumps(scores, indent=2, ensure_ascii=False), encoding="utf-8")
        if summary:
            SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply manual vehicle overrides (YAML).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    rep = run(dry_run=args.dry_run)
    print(json.dumps(rep, indent=2))
    print(f"\n{'[dry-run] ' if args.dry_run else ''}scores set: {len(rep['scoresUpdated'])}, "
          f"trims set: {len(rep['trimsUpdated'])}, untouched: {len(rep['skipped'])}, "
          f"unmatched: {len(rep.get('unmatched', []))}")
    if rep.get("unmatched"):
        print(f"  unmatched override keys (no such vehicle): {rep['unmatched']}")


if __name__ == "__main__":
    main()
