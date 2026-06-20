"""
main.py — Orchestrates the EVsense vehicle data pipeline.

RELIABILITY-FIRST ARCHITECTURE (2026 rewrite)
---------------------------------------------
The old pipeline drove the catalog off ~10 per-brand Playwright/Selenium scrapers
that broke whenever a brand site changed its layout or tightened bot detection.
That is the single least reliable way to maintain a production catalog.

This version is built on free, stable, government / structured sources — the same
dual-source design recommended for a self-updating US EV catalog:

  1. fueleconomy.gov  (EPA/DOE bulk CSV) — authoritative specs for every EV
     already on sale in the US. One HTTP download, no DOM scraping. We trim it to
     the most popular models per class (Edmunds class rankings + US sales leaders;
     see POPULARITY_RANK in us_ev_catalog_scraper.py).
  2. NHTSA vPIC API   — pre-release "upcoming model" radar. Manufacturers must
     register models with NHTSA before US sale, so this catches new EVs before
     EPA rates them.

These two feed the catalog, which the matcher generator turns into the JSON the
frontend reads directly from frontend/public/data/. No database is required for
the catalog itself.

DEFAULT RUN
-----------
    python main.py                 # EPA catalog → vPIC radar → incentives → matcher
    python main.py --dry-run       # build everything, write nothing
    python main.py --top-per-class 6
    python main.py --no-radar      # skip vPIC upcoming scan
    python main.py --no-incentives # skip NREL incentive pull

LEGACY BRAND SCRAPERS (opt-in, deprecated)
------------------------------------------
The fragile per-brand scrapers are retained only as an opt-in path. They have been
moved to scraper/archive/ (see scraper/archive/README.md). Run them explicitly:

    python main.py --legacy-brands            # all archived brand scrapers
    python main.py --legacy-brands --brand tesla
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from config import setup_logging, VEHICLES_SUMMARY_PATH, REPORTS_DIR

import logging
setup_logging()

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"


# ───────────────────────────────────────────────────────────────────────────────
# Reliable pipeline steps
# ───────────────────────────────────────────────────────────────────────────────
def step_us_catalog(top_per_class: int, dry_run: bool) -> dict:
    """fueleconomy.gov (EPA/DOE) → catalog JSON.

    Writes TWO files:
      • us_ev_catalog_full.json — every US EV in the year window (all models).
        Used by the detail trim-sync so it can find specs for ANY curated vehicle.
      • us_ev_catalog.json — trimmed to the most popular models per class. Feeds
        the matcher (the lean, popular-only browse pool).
    """
    from pathlib import Path as _Path
    from scrapers.us_ev_catalog_scraper import (
        fetch_bulk_csv, build_catalog, write_catalog, OUT_PATH,
    )
    cy = datetime.now(timezone.utc).year
    years = [cy - 1, cy, cy + 1]
    print(f"\n[1/4] US EV catalog (fueleconomy.gov), years={years}, "
          f"top_per_class={top_per_class} ...")
    csv_text = fetch_bulk_csv()
    full = build_catalog(csv_text, years, top_per_class=None)
    popular = build_catalog(csv_text, years, top_per_class=top_per_class or None)
    if dry_run:
        from collections import Counter
        by_class = Counter(v["body_style"] for v in popular)
        print(f"  [dry-run] full={len(full)} popular={len(popular)} "
              f"(popular by class: {dict(by_class)}) — not written")
        return {"ok": True, "count": len(popular), "full": len(full), "dryRun": True}
    full_path = _Path(OUT_PATH).with_name("us_ev_catalog_full.json")
    write_catalog(full, years, out_path=full_path)
    payload = write_catalog(popular, years)
    print(f"  wrote {payload['count']} popular (+{len(full)} in full catalog) "
          f"(current={payload['current_count']} upcoming={payload['upcoming_count']} "
          f"priced={payload['priced_count']})")
    return {"ok": True, "count": payload["count"], "full": len(full)}


def step_upcoming_radar(dry_run: bool, merge: bool = True) -> dict:
    """NHTSA vPIC → upcoming_radar.json, optionally merged into the catalog."""
    from scrapers.nhtsa_upcoming import scan, write_radar, merge_into_catalog
    cy = datetime.now(timezone.utc).year
    years = [cy + 1, cy + 2]
    print(f"\n[2/4] NHTSA vPIC upcoming radar, model years={years} ...")
    candidates = scan(years)
    new_count = sum(1 for c in candidates if not c["already_in_catalog"])
    if dry_run:
        print(f"  [dry-run] {len(candidates)} candidates ({new_count} new) — not written")
        return {"ok": True, "count": len(candidates), "new": new_count, "dryRun": True}
    write_radar(candidates, years)
    added = merge_into_catalog(candidates) if merge else 0
    print(f"  {len(candidates)} candidates ({new_count} new); merged {added} into catalog")
    return {"ok": True, "count": len(candidates), "new": new_count, "merged": added}


def step_incentives(dry_run: bool) -> dict:
    """NREL/AFDC → state + federal incentive data."""
    from incentives.nrel_incentives import run_incentive_pull
    api_key = os.environ.get("NREL_API_KEY", "DEMO_KEY")
    print("\n[3/4] Incentives (NREL/AFDC) ...")
    inc = run_incentive_pull(api_key=api_key, dry_run=dry_run, write_js=not dry_run)
    print("  incentives refreshed")
    return {"ok": True, "data": inc}


def step_sync_trims(dry_run: bool) -> dict:
    """Correct per-vehicle detail trims (range/drivetrain/efficiency) from EPA."""
    from processors.detail_trim_sync import run as sync_trims
    print("\n[3.5/4] Syncing detail-file trims from EPA catalog ...")
    rep = sync_trims(dry_run=dry_run)
    if rep.get("ok") is False:
        print(f"  skipped: {rep.get('error')}")
        return rep
    print(f"  updated {len(rep.get('updated', []))} file(s), "
          f"skipped {len(rep.get('skipped', []))} "
          f"{'[dry-run]' if dry_run else ''}")
    return rep


def step_gcc(dry_run: bool) -> dict:
    """GreenCarsCompare → vehicle_scores.json (opt-in; needs Playwright).

    Limited to three metrics: overall score, value score, and max cargo volume.
    The app surfaces these generically (no provider name in the UI).
    """
    from scrapers.greencarscompare_scraper import scrape, write
    print("\n[GCC] Scores (overall / value / max storage) ...")
    payload = scrape()
    if not dry_run:
        write(payload)
    print(f"  matched {payload['matchedCount']} vehicles "
          f"{'[dry-run]' if dry_run else ''}")
    return {"ok": True, "matched": payload["matchedCount"]}


def step_overrides(dry_run: bool) -> dict:
    """Apply manual YAML overrides (scores + trims) over the scraped data."""
    from processors.apply_overrides import run as apply_overrides
    print("\n[Overrides] Applying vehicle_overrides.yaml ...")
    rep = apply_overrides(dry_run=dry_run)
    print(f"  scores set={len(rep['scoresUpdated'])} trims set={len(rep['trimsUpdated'])} "
          f"untouched={len(rep['skipped'])} {'[dry-run]' if dry_run else ''}")
    return {"ok": True, **{k: len(rep[k]) for k in ('scoresUpdated', 'trimsUpdated', 'skipped')}}


def step_matcher(max_count: int, dry_run: bool) -> dict:
    """Merge catalog + curated summary → matcher_vehicles.json (frontend reads this)."""
    from processors.matcher_generator import build_matcher_vehicles, write_matcher_vehicles
    print(f"\n[4/4] Matcher vehicles (max={max_count}) ...")
    vehicles = build_matcher_vehicles(max_count=max_count)
    payload = write_matcher_vehicles(vehicles, dry_run=dry_run)
    print(f"  {payload['total']} vehicles "
          f"(full={payload['tierCounts']['full']} "
          f"estimated={payload['tierCounts']['estimated']}) "
          f"{'[dry-run, not written]' if dry_run else ''}")
    return {"ok": True, "total": payload["total"], "counts": payload["tierCounts"]}


def run_reliable_pipeline(
    top_per_class: int = 4,
    dry_run: bool = False,
    do_radar: bool = True,
    do_incentives: bool = True,
    do_sync_trims: bool = True,
    do_gcc: bool = False,
    max_matcher: int = 300,
) -> dict:
    """The default, reliable, API-driven pipeline. JSON-file output only."""
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "steps": {}}

    def _run(name, fn, *a):
        try:
            report["steps"][name] = fn(*a)
        except Exception as e:  # noqa: BLE001
            report["steps"][name] = {"ok": False, "error": str(e)}
            print(f"  FAIL {name}: {e}")

    _run("us_catalog", step_us_catalog, top_per_class, dry_run)
    if do_radar:
        _run("upcoming_radar", step_upcoming_radar, dry_run)
    if do_incentives:
        _run("incentives", step_incentives, dry_run)
    if do_sync_trims:
        _run("sync_trims", step_sync_trims, dry_run)
    if do_gcc:
        _run("gcc", step_gcc, dry_run)
    # Manual overrides always run last (cheap, local) so they win over scraping.
    _run("overrides", step_overrides, dry_run)
    _run("matcher", step_matcher, max_matcher, dry_run)

    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    return report


# ───────────────────────────────────────────────────────────────────────────────
# Legacy per-brand scrapers (deprecated, opt-in only)
# ───────────────────────────────────────────────────────────────────────────────
# These fragile Playwright/Selenium scrapers live in scraper/archive/ now. We
# import them lazily so the default pipeline has zero dependency on them and so
# this still works whether the files sit in archive/ or (pre-move) in scrapers/.
LEGACY_BRANDS = [
    "tesla", "hyundai", "kia", "ford", "chevrolet",
    "rivian", "bmw", "volkswagen", "lucid", "polestar",
]


def _load_legacy_scrapers() -> dict:
    """Resolve the archived brand scraper classes, trying archive/ then scrapers/."""
    import importlib

    def _imp(modpath):
        for base in ("archive", "scrapers"):
            try:
                return importlib.import_module(f"{base}.{modpath}")
            except ImportError:
                continue
        raise ImportError(f"Could not import {modpath} from archive/ or scrapers/")

    mods = {}
    mods["tesla"]      = _imp("tesla_scraper").TeslaScraper
    mods["hyundai"]    = _imp("hyundai_scraper").HyundaiScraper
    mods["kia"]        = _imp("kia_scraper").KiaScraper
    mods["ford"]       = _imp("ford_scraper").FordScraper
    mods["chevrolet"]  = _imp("chevrolet_scraper").ChevroletScraper
    mods["rivian"]     = _imp("rivian_scraper").RivianScraper
    rem = _imp("remaining_scrapers")
    mods["bmw"]        = rem.BMWScraper
    mods["volkswagen"] = rem.VolkswagenScraper
    mods["lucid"]      = rem.LucidScraper
    mods["polestar"]   = rem.PolestarScraper
    return mods


async def run_legacy_brands(brand: str = "", dry_run: bool = False) -> list[dict]:
    """Run the deprecated per-brand scrapers and upsert into Firestore.

    Kept only for spot-refreshing a single brand's live MSRP/offers. Requires
    Firebase credentials and the archived scraper modules + Playwright/Selenium.
    """
    print("\n[LEGACY] Per-brand scrapers are DEPRECATED and fragile. "
          "Prefer the default reliable pipeline. See scraper/archive/README.md.\n")
    scrapers = _load_legacy_scrapers()
    from firebase_client import FirebaseClient
    from processors.price_processor import process_prices_before_write

    targets = {brand: scrapers[brand]} if brand else scrapers
    reports = []
    for b, cls in targets.items():
        rep = {"brand": b, "status": "pending", "vehicles": 0, "errors": []}
        scraper = cls(dry_run=dry_run)
        try:
            print(f"{'='*40}\n  Legacy scrape: {b.upper()}\n{'='*40}")
            vehicles = await scraper.scrape()
            rep["vehicles"] = len(vehicles)
            if not dry_run:
                client = FirebaseClient()
                now_iso = datetime.now(timezone.utc).isoformat()
                for v in vehicles:
                    existing_ref = client._db.collection('vehicles').document(v['id']).get()
                    existing = existing_ref.to_dict() if existing_ref.exists else None
                    v = process_prices_before_write(existing, v)
                    v.setdefault("offerLastUpdated", now_iso)
                    await client.upsert_vehicle(v)
            rep["status"] = "success"
        except Exception as e:  # noqa: BLE001
            rep["status"] = "failed"
            rep["errors"].append(str(e))
            print(f"  FAIL {b}: {e}")
        finally:
            await scraper.close()
        reports.append(rep)
    return reports


# ───────────────────────────────────────────────────────────────────────────────
# CLI
# ───────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="EVsense vehicle data pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Build everything, write nothing")
    parser.add_argument("--top-per-class", type=int, default=4,
                        help="Keep N most popular models per body class (0 = all). Default 4.")
    parser.add_argument("--no-radar", action="store_true", help="Skip NHTSA vPIC upcoming scan")
    parser.add_argument("--no-incentives", action="store_true", help="Skip NREL incentive pull")
    parser.add_argument("--no-sync-trims", action="store_true",
                        help="Skip syncing per-vehicle detail trims from the EPA catalog")
    parser.add_argument("--with-gcc", action="store_true",
                        help="Also scrape GreenCarsCompare scores (overall/value/max storage)")
    parser.add_argument("--max-matcher", type=int, default=300, help="Max vehicles in matcher output")
    # Legacy
    parser.add_argument("--legacy-brands", action="store_true",
                        help="Run the DEPRECATED per-brand Playwright/Selenium scrapers")
    parser.add_argument("--brand", default="", help="With --legacy-brands: a single brand only")
    # Deprecated flags — accepted for backward compatibility with existing CI/cron
    # invocations. Incentives now run by default; these are no-ops unless noted.
    parser.add_argument("--refresh-incentives", action="store_true",
                        help="(deprecated) incentives run by default")
    parser.add_argument("--refresh-realworld", action="store_true",
                        help="(deprecated) real-world blog scrapers archived")
    parser.add_argument("--realworld-vehicle", default="", help="(deprecated, ignored)")
    parser.add_argument("--leases-only", action="store_true",
                        help="(deprecated) lease/offer scraping moved to legacy brand path")
    args = parser.parse_args()

    if args.leases_only or args.refresh_realworld or args.realworld_vehicle:
        print("[note] --leases-only/--refresh-realworld/--realworld-vehicle are "
              "deprecated no-ops in the reliable pipeline. See scraper/archive/README.md.")

    if args.dry_run:
        print("\n[DRY RUN] No files will be written\n")

    if args.legacy_brands:
        import asyncio
        brand = args.brand.lower()
        if brand and brand not in LEGACY_BRANDS:
            print(f"Unknown brand: {brand}. Available: {', '.join(LEGACY_BRANDS)}")
            return
        reports = asyncio.run(run_legacy_brands(brand=brand, dry_run=args.dry_run))
        report = {"legacyBrands": reports}
    else:
        report = run_reliable_pipeline(
            top_per_class=args.top_per_class,
            dry_run=args.dry_run,
            do_radar=not args.no_radar,
            do_incentives=not args.no_incentives,
            do_sync_trims=not args.no_sync_trims,
            do_gcc=args.with_gcc,
            max_matcher=args.max_matcher,
        )

    # Write run report
    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / f"scrape_report_{datetime.now().strftime('%Y-%m-%d')}.json"
    report["runAt"] = datetime.now(timezone.utc).isoformat()
    report["dryRun"] = args.dry_run
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\n{'='*50}\n  Pipeline complete — report: {report_path}\n{'='*50}\n")


# ───────────────────────────────────────────────────────────────────────────────
# Programmatic entry point (AWS Lambda cron / run_local.py / CI smoke tests)
# ───────────────────────────────────────────────────────────────────────────────
def run_pipeline(
    dry_run: bool = False,
    refresh_incentives: bool = True,
    top_per_class: int = 4,
    do_radar: bool = True,
    do_sync_trims: bool = True,
    max_matcher: int = 300,
    build_images: bool = False,
    image_mode: str = "local",
    image_bucket: str | None = None,
    image_cdn_domain: str | None = None,
    **_legacy_kwargs,
) -> dict:
    """Run the reliable pipeline programmatically. Mirrors the CLI defaults.

    Extra/legacy keyword args are accepted and ignored for backward compatibility
    with older callers (lambda_handler.py, run_local.py).
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    report = run_reliable_pipeline(
        top_per_class=top_per_class,
        dry_run=dry_run,
        do_radar=do_radar,
        do_incentives=refresh_incentives,
        do_sync_trims=do_sync_trims,
        max_matcher=max_matcher,
    )

    if build_images and not dry_run:
        try:
            from image_pipeline import ImagePipeline
            pipe = ImagePipeline(
                mode=image_mode, bucket=image_bucket,
                cdn_domain=image_cdn_domain, dry_run=dry_run,
            )
            report["steps"]["images"] = {"ok": True, "data": pipe.process_summary_file()}
        except Exception as e:  # noqa: BLE001
            report["steps"]["images"] = {"ok": False, "error": str(e)}

    return report


if __name__ == "__main__":
    main()
