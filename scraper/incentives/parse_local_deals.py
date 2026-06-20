"""
parse_local_deals.py — turn SAVED Edmunds deals pages into incentive data.

Edmunds blocks automated per-trim fetching hard (403s), so the reliable way to
get true per-trim, per-payment-type offers is to save the deals pages yourself
and drop the HTML files into a folder. This script parses them — no network.

HOW TO USE
----------
1. In your browser, open each deals page for the trim(s) you care about, e.g.
   https://www.edmunds.com/hyundai/ioniq-5/2026/deals/  (pick a trim in the
   dropdown to load that trim's offers), then File → Save Page As… → "Webpage,
   HTML Only". Save one file per trim you want captured.
2. Put the .htm/.html files in:  scraper/incentives/deals_html/
   (filenames don't matter — the vehicle is detected from the page. To force a
   vehicle, prefix the filename with its id, e.g. "kia-ev6-2025__gt.html".)
3. Run:
       python scraper/incentives/parse_local_deals.py --zip 10005
   It merges the parsed offers into frontend/public/data/incentives_by_vehicle.json
   (the same file the live scraper writes), so Browse / Calculator / Matcher pick
   them up with no other changes.

Each file contributes whatever trims it embeds; multiple files for the same
vehicle are merged, so you can capture several trims by saving several pages.

Categorization (identical to the live scraper):
  cash    → regular customer/bonus cash      (factored into totals)
  finance → best APR + finance cash          (factored into totals)
  lease   → 24 & 36-month advertised monthly
  lease cash (Limited Term Lease Offer)      → popup only, NOT in totals
  other   → informational
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Import the shared parsing/categorization helpers from the live scraper so the
# offline path produces byte-for-byte the same shape.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import edmunds_incentives as E  # noqa: E402

DEALS_DIR_DEFAULT = Path(__file__).resolve().parent / "deals_html"

# Nameplates whose deals page mixes gas + electric trims — keep only EV trims so
# the gas model's offers don't leak into the EV app (e.g. Mercedes CLA).
TRIM_INCLUDE = {
    "mercedes-benz-cla-2026": re.compile(r"eq\s*technology|electric|\beq\b", re.I),
}


def _strip_year(vid: str) -> str:
    """Drop a trailing -YYYY slug so ids match regardless of the year suffix."""
    return re.sub(r"-(?:19|20)\d{2}$", "", vid or "")

# Canonical deals URL embedded in the page: .../<make>/<model>/<year>/deals
_RE_CANONICAL = re.compile(
    r'https?://(?:www\.)?edmunds\.com/([a-z0-9-]+)/([a-z0-9-]+)/(\d{4})/deals',
    re.I,
)
# Title fallback: "2026 Kia EV6 Deals, Incentives & Rebates for May 2026 | Edmunds"
_RE_TITLE = re.compile(r'<title>\s*(\d{4})\s+([A-Za-z]+(?:[ -][A-Za-z0-9]+)*?)\s+Deals', re.I)


def _read(path: Path) -> str:
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=enc, errors="strict")
        except (UnicodeDecodeError, LookupError):
            continue
    return path.read_text(encoding="utf-8", errors="ignore")


def _build_lookup():
    """Return (id_set, base_to_id, slug_to_id) from vehicles_summary.json."""
    summary = []
    if E.SUMMARY_IN.exists():
        summary = json.loads(E.SUMMARY_IN.read_text("utf-8"))
    id_set = {v.get("id") for v in summary if v.get("id")}
    base_to_id = {}
    slug_to_id = {}
    for v in summary:
        vid = v.get("id")
        if not vid:
            continue
        base_to_id.setdefault(_strip_year(vid), vid)
        ms = E._make_to_slug(v.get("make", ""))
        mo = E._model_to_slug(v.get("model", ""))
        if ms and mo:
            slug_to_id.setdefault((ms, mo), vid)
    return id_set, base_to_id, slug_to_id


def _resolve_vehicle(path: Path, html: str, lookup) -> tuple[str | None, str | None]:
    """
    Return (vehicleId, canonicalUrl) for a saved deals file.
      1) filename prefix before '__' or '.' that matches a known id (year-insensitive)
      2) canonical deals URL in the HTML  → make/model slug match
      3) <title> "YYYY Make Model Deals…" → make/model slug match
    """
    id_set, base_to_id, slug_to_id = lookup

    # 1) explicit id in the filename
    stem = path.stem
    cand = re.split(r'__|\.', stem)[0].strip().lower()
    if cand in id_set:
        return cand, None
    if cand in base_to_id:
        return base_to_id[cand], None

    # 2) canonical URL
    canon = None
    m = _RE_CANONICAL.search(html)
    if m:
        make_slug, model_slug, year = m.group(1).lower(), m.group(2).lower(), m.group(3)
        canon = f"https://www.edmunds.com/{make_slug}/{model_slug}/{year}/deals/"
        vid = slug_to_id.get((make_slug, model_slug))
        if vid:
            return vid, canon

    # 3) <title>
    tm = _RE_TITLE.search(html)
    if tm:
        make = tm.group(2).split()[0]
        model = " ".join(tm.group(2).split()[1:])
        ms, mo = E._make_to_slug(make), E._model_to_slug(model)
        vid = slug_to_id.get((ms, mo))
        if vid:
            return vid, canon

    return None, canon


def run(deals_dir: Path, zip_code: str, region: str, dry_run: bool = False) -> dict:
    E.DEFAULT_ZIP = zip_code
    E.DEFAULT_REGION = region
    lookup = _build_lookup()

    files = sorted([p for p in deals_dir.glob("*")
                    if p.suffix.lower() in (".htm", ".html")])
    report = {"dir": str(deals_dir), "files": len(files), "vehicles": {},
              "unresolved": [], "dryRun": dry_run}
    if not files:
        print(f"No .htm/.html files found in {deals_dir}")
        return report

    # vehicleId → {"trims": {...merged...}, "url": canonical, "files": []}
    acc: dict = {}
    for path in files:
        html = _read(path)
        vid, canon = _resolve_vehicle(path, html, lookup)
        if not vid:
            report["unresolved"].append(path.name)
            print(f"  ?  {path.name}: could not resolve vehicle (prefix the "
                  f"filename with a vehicle id, e.g. kia-ev6-2025__gt.html)")
            continue
        v2 = E._extract_incentives_v2_raw(html)
        trims = v2.get("trims") or {}
        # EV-only nameplates: drop any non-electric trim blocks (and skip a file
        # that's entirely the gas model, e.g. a saved CLA 250 / AMG page).
        include = TRIM_INCLUDE.get(vid)
        if include:
            file_trim = re.split(r'__', path.stem, 1)[-1]
            if path.stem != file_trim and not include.search(file_trim.replace("-", " ")):
                print(f"  ·  {path.name}: skipped (non-EV trim of {vid})")
                continue
            trims = {lbl: e for lbl, e in trims.items() if include.search(lbl)}
        if not trims:
            print(f"  !  {path.name}: parsed as {vid} but found no incentives")
        bucket = acc.setdefault(vid, {"trims": {}, "url": None, "files": []})
        bucket["files"].append(path.name)
        if canon and not bucket["url"]:
            bucket["url"] = canon
        for label, entry in trims.items():
            bucket["trims"].setdefault(label, entry)
        print(f"  ok {path.name}: {vid} (+{len(trims)} trim block(s))")

    # Build per-vehicle records in the canonical shape.
    now = datetime.now(timezone.utc).isoformat()
    out_records: dict = {}
    skipped_empty: list = []
    for vid, bucket in acc.items():
        # Don't overwrite an existing record with nothing — a blocked/403 page
        # (e.g. BMW) parses to zero trims; leave the prior data intact.
        if not bucket["trims"]:
            skipped_empty.append(vid)
            continue
        merged = E._remap_trims_to_app(vid, bucket["trims"])
        model = E._aggregate_model(merged)
        lease36 = model["lease"]["terms"].get("36") or model["lease"]["terms"].get("24") or {}
        out_records[vid] = {
            "edmundsUrl": bucket["url"] or f"https://www.edmunds.com/ (local file)",
            "yearUsed": None,
            "scrapedAt": now,
            "scraped": True,
            "error": None,
            "source": "edmunds-local",
            "zip": zip_code,
            "region": region,
            "schemaVersion": 2,
            "filesParsed": bucket["files"],
            "trims": merged,
            "cashRebate": model["cash"]["rebate"] or 0,
            "loyaltyBonus": 0,
            "leaseMonthly": lease36.get("monthlyPayment"),
            "leaseDownPayment": lease36.get("dueAtSigning"),
            "leaseTerm": 36 if "36" in model["lease"]["terms"] else (24 if "24" in model["lease"]["terms"] else None),
            "leaseMileagePerYear": lease36.get("milesPerYear") or 10000,
            "leaseCash": model["lease"]["leaseCash"] or 0,   # popup only — NOT in totals
            "financeApr": model["finance"]["apr"],
            "financeTerm": model["finance"]["termMonths"] or 60,
            "totalIncentiveValue": model["cash"]["rebate"] or 0,
        }
        report["vehicles"][vid] = {
            "trims": len(merged),
            "cash": out_records[vid]["cashRebate"],
            "leaseCash": out_records[vid]["leaseCash"],
            "financeApr": out_records[vid]["financeApr"],
            "files": bucket["files"],
        }

    # Merge into the existing incentives_by_vehicle.json (local records win).
    existing = {"vehicles": {}}
    if E.VEHICLE_PATH.exists():
        try:
            existing = json.loads(E.VEHICLE_PATH.read_text("utf-8"))
            existing.setdefault("vehicles", {})
        except Exception:
            existing = {"vehicles": {}}
    existing["vehicles"].update(out_records)
    existing["lastUpdated"] = now
    existing.setdefault("source", "edmunds")
    existing["zip"] = zip_code
    existing["region"] = region
    existing["schemaVersion"] = 2

    report["skippedEmpty"] = skipped_empty
    if skipped_empty:
        print(f"\nLeft existing data untouched for {len(skipped_empty)} vehicle(s) with "
              f"no parseable incentives (likely 403/blocked saves): {', '.join(skipped_empty)}")
    if not dry_run:
        E.VEHICLE_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False),
                                  encoding="utf-8")
        print(f"\nWrote {len(out_records)} vehicle(s) into {E.VEHICLE_PATH}")
    else:
        print(f"\n[dry-run] would write {len(out_records)} vehicle(s)")
    return report


def main() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="Parse saved Edmunds deals HTML into incentive data")
    ap.add_argument("--dir", default=str(DEALS_DIR_DEFAULT),
                    help=f"Directory of saved .htm/.html deals pages (default {DEALS_DIR_DEFAULT})")
    ap.add_argument("--zip", default=E.DEFAULT_ZIP, help="ZIP stamped on the output (default 10005)")
    ap.add_argument("--region", default=E.DEFAULT_REGION, help="Region label (default NY)")
    ap.add_argument("--dry-run", action="store_true", help="Parse but don't write")
    args = ap.parse_args()

    deals_dir = Path(args.dir)
    deals_dir.mkdir(parents=True, exist_ok=True)
    rep = run(deals_dir, args.zip, args.region, dry_run=args.dry_run)
    print("\n" + json.dumps(rep, indent=2))
    print(f"\nParsed {rep['files']} file(s) → {len(rep['vehicles'])} vehicle(s); "
          f"{len(rep['unresolved'])} unresolved.")


if __name__ == "__main__":
    main()
