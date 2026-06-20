"""
run_local.py — End-to-end local pipeline runner. No AWS, no Firebase needed.

What it does (in order):
  1. (optional) Scrape per-vehicle incentive deals from Edmunds.com deals pages.
  2. Build matcher_vehicles.json from vehicles_summary.json + ev_database.json.
  3. (optional) Fetch + transcode vehicle images to frontend/public/data/images/
     and write back imagesCdnBase into vehicles_summary.json + matcher_vehicles.json.

All outputs land under frontend/public/data/ — Vite's dev server picks them up
automatically.

Usage (defaults are sensible for first run):
    python run_local.py                          # incentives + matcher_vehicles
    python run_local.py --images                 # also process all images
    python run_local.py --images --vehicle tesla-model3-2025
    python run_local.py --skip-incentives --images
    python run_local.py --patch-summary          # write real lease/finance back to summary
    python run_local.py --max-matcher 150
    python run_local.py --dry-run

Why this exists separately from main.py:
  main.py drives the full Firestore-backed monthly scrape (cloud workflow).
  run_local.py is the developer's "make my JSON pretty without any cloud" loop.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Force UTF-8 stdout so Windows cp1252 doesn't choke on emoji / arrows in logs.
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRAPER_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRAPER_DIR))
sys.path.insert(0, str(SCRAPER_DIR / "incentives"))
sys.path.insert(0, str(SCRAPER_DIR / "processors"))

from image_pipeline import ImagePipeline
from incentives.edmunds_incentives import run_edmunds_pull
from processors.matcher_generator import build_matcher_vehicles, write_matcher_vehicles, OUT_PATH as MATCHER_OUT
from scrapers.us_ev_catalog_scraper import (
    fetch_bulk_csv as _us_fetch_csv,
    build_catalog as _us_build_catalog,
    write_catalog as _us_write_catalog,
)

PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"


def _load_env_quietly() -> None:
    """Load .env if present (mirrors scraper/config.py behavior)."""
    env_file = SCRAPER_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _annotate_matcher_with_cdn(image_results: dict) -> int:
    """
    After the image pipeline runs, copy `imagesCdnBase` values from the
    summary back into matcher_vehicles.json so the Matcher cards also use
    optimized images. Returns count of entries updated.
    """
    summary_path = DATA_DIR / "vehicles_summary.json"
    matcher_path = DATA_DIR / "matcher_vehicles.json"
    if not (summary_path.exists() and matcher_path.exists()):
        return 0
    summary  = json.loads(summary_path.read_text("utf-8"))
    matcher  = json.loads(matcher_path.read_text("utf-8"))
    cdn_map = {v["id"]: v.get("imagesCdnBase") for v in summary if v.get("imagesCdnBase")}
    updated = 0
    for v in matcher.get("vehicles", []):
        if v["id"] in cdn_map:
            v["imagesCdnBase"] = cdn_map[v["id"]]
            updated += 1
    if updated:
        matcher_path.write_text(json.dumps(matcher, indent=2), "utf-8")
    return updated


def run(args) -> dict:
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "steps": []}

    # ── Step 1: Edmunds per-vehicle incentive deals ─────────────────────────
    if not args.skip_incentives:
        print(f"\n[1/3] Edmunds incentives ({'DRY-RUN' if args.dry_run else 'live'}, "
              f"patch_summary={args.patch_summary})")
        try:
            inc_report = run_edmunds_pull(
                vehicle_filter=args.incentive_vehicle,
                patch_summary=args.patch_summary,
                dry_run=args.dry_run,
                sleep_between=args.incentive_sleep,
            )
            scraped = inc_report.get("scraped", 0)
            deals   = inc_report.get("dealsFound", 0)
            print(f"  -> {scraped}/{inc_report.get('total', 0)} vehicles scraped, "
                  f"{deals} deal(s) found")
            report["steps"].append({"step": "incentives", "ok": True, "data": inc_report})
        except Exception as e:
            print(f"  ! Edmunds incentive pull failed: {e}")
            report["steps"].append({"step": "incentives", "ok": False, "error": str(e)})
    else:
        print("\n[1/3] Skipping incentives (--skip-incentives)")
        report["steps"].append({"step": "incentives", "ok": True, "skipped": True})

    # ── Step 1.5: US EV catalog (fueleconomy.gov / EPA) ─────────────────────
    # Refreshes us_ev_catalog.json — the authoritative US-market source the
    # matcher prefers. Off by default (the file is committed + refreshed
    # monthly); pass --refresh-us-catalog to pull a fresh EPA dataset.
    if args.refresh_us_catalog:
        print("\n[1.5] US EV catalog (fueleconomy.gov / EPA)")
        try:
            from datetime import datetime as _dt, timezone as _tz
            cy = _dt.now(_tz.utc).year
            years = args.us_catalog_years or [cy - 1, cy, cy + 1]
            csv_text = _us_fetch_csv()
            vehicles = _us_build_catalog(csv_text, years)
            payload = _us_write_catalog(vehicles, years)
            print(f"  -> {payload['count']} models "
                  f"(current={payload['current_count']}, upcoming={payload['upcoming_count']}, "
                  f"recent={payload['recent_count']}, priced={payload['priced_count']})")
            report["steps"].append({"step": "us_catalog", "ok": True,
                                    "count": payload["count"]})
        except Exception as e:
            print(f"  ! US EV catalog refresh failed: {e}")
            report["steps"].append({"step": "us_catalog", "ok": False, "error": str(e)})
    else:
        print("\n[1.5] Skipping US EV catalog refresh (pass --refresh-us-catalog to pull fresh EPA data)")
        report["steps"].append({"step": "us_catalog", "ok": True, "skipped": True})

    # ── Step 2: matcher vehicles ───────────────────────────────────────────
    print(f"\n[2/3] matcher_vehicles.json (max={args.max_matcher})")
    try:
        vehicles = build_matcher_vehicles(max_count=args.max_matcher)
        payload  = write_matcher_vehicles(vehicles, out_path=MATCHER_OUT, dry_run=args.dry_run)
        print(f"  -> {payload['total']} vehicles ({payload['tierCounts']['full']} full, "
              f"{payload['tierCounts']['estimated']} estimated)")
        report["steps"].append({"step": "matcher_vehicles", "ok": True, "counts": payload["tierCounts"], "total": payload["total"]})
    except Exception as e:
        print(f"  ! matcher build failed: {e}")
        report["steps"].append({"step": "matcher_vehicles", "ok": False, "error": str(e)})

    # ── Step 3: images ─────────────────────────────────────────────────────
    if args.images:
        print(f"\n[3/3] Image pipeline (mode={args.image_mode}, dry={args.dry_run})")
        try:
            pipe = ImagePipeline(
                mode=args.image_mode,
                bucket=args.s3_bucket,
                cdn_domain=args.cdn_domain,
                dry_run=args.dry_run,
            )
            img_report = pipe.process_summary_file(
                vehicle_filter=args.vehicle,
                sleep_between=args.sleep,
            )
            updated_matcher = _annotate_matcher_with_cdn(img_report)
            img_report["matcherEntriesUpdated"] = updated_matcher
            print(f"  -> {img_report['succeeded']} ok, {img_report['failed']} failed, "
                  f"{img_report['skipped']} skipped (matcher updated: {updated_matcher})")
            report["steps"].append({"step": "images", "ok": True, "data": img_report})
        except Exception as e:
            print(f"  ! image pipeline failed: {e}")
            report["steps"].append({"step": "images", "ok": False, "error": str(e)})
    else:
        print("\n[3/3] Skipping images (pass --images to enable)")
        report["steps"].append({"step": "images", "ok": True, "skipped": True})

    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    return report


def _main():
    _load_env_quietly()

    parser = argparse.ArgumentParser(description="EVsense — run pipeline locally (no cloud)")
    # Incentives (Edmunds)
    parser.add_argument("--skip-incentives", action="store_true",
                        help="Skip the Edmunds incentive scrape entirely")
    parser.add_argument("--incentive-vehicle", default=None, metavar="ID",
                        help="Incentives: only scrape this vehicle id (e.g. chevrolet-equinox-ev-2025)")
    parser.add_argument("--incentive-sleep", type=float, default=2.5,
                        help="Incentives: seconds between Edmunds requests (default 2.5)")
    parser.add_argument("--patch-summary", action="store_true",
                        help="Write real leaseFrom/financeFrom from Edmunds back into vehicles_summary.json")
    # US EV catalog (fueleconomy.gov / EPA)
    parser.add_argument("--refresh-us-catalog", action="store_true",
                        help="Pull a fresh US EV catalog from fueleconomy.gov before building the matcher")
    parser.add_argument("--us-catalog-years", type=int, nargs="*", default=None,
                        help="Model years for the US catalog (default: current-1, current, current+1)")
    # Matcher
    parser.add_argument("--max-matcher", type=int, default=300,
                        help="Max vehicles in matcher_vehicles.json (default 300)")
    # Images
    parser.add_argument("--images", action="store_true", help="Run the image pipeline")
    parser.add_argument("--image-mode", choices=("local", "s3"), default="local")
    parser.add_argument("--s3-bucket", default=None)
    parser.add_argument("--cdn-domain", default=None)
    parser.add_argument("--vehicle", default=None, help="Image: only process this vehicle id")
    parser.add_argument("--sleep", type=float, default=0.6, help="Image: throttle between vehicles")
    # Global
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", default=None, help="Write pipeline report to this JSON path")
    args = parser.parse_args()

    report = run(args)

    print("\n" + "=" * 60)
    print(json.dumps({"steps": [s.get("step") + (": OK" if s.get("ok") else ": FAIL")
                                for s in report["steps"]]}, indent=2))
    print("=" * 60)

    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2, default=str), "utf-8")
        print(f"\nReport written to: {args.report}")


if __name__ == "__main__":
    _main()
