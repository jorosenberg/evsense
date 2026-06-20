"""
lease_trim_sync.py — sync detail-file trims from the Edmunds lease calculator.

WHY
---
The per-vehicle detail files (frontend/public/data/vehicles/{id}.json) drive the
detail-page trim picker, the header price, and the cost calculator. Their trim
lists were incomplete (missing styles like SEL / Performance Limited), carried
inaccurate MSRPs (e.g. IONIQ 9 "S" showed $68,490 vs Edmunds' ~$60.5k), and
some had no top-level msrpFrom at all — which made the lease residual
(msrp x residual%) compute to $0.

lease_calc_by_vehicle.json (from scrape_lease_calculator.py) is the authoritative
source for WHICH styles exist and WHAT THEY COST: every Edmunds style with its
MSRP and selling price per term. This processor rebuilds each detail file's
`trims` from those styles, while inheriting the specs (range / efficiency /
horsepower), colors and offers from the existing curated/EPA trims so nothing
useful is lost.

WHAT IT DOES, per detail file that has lease-calc styles
--------------------------------------------------------
1. Clean each lease-calc style label into a display name ("SE 4dr SUV AWD
   (electric DD)" -> "SE AWD") and read its MSRP + selling price (prefer the
   36-month entry, fall back to 24).
2. Match the style to the closest existing detail trim (by drivetrain + name
   token overlap) and INHERIT its specs / colors / offers.
3. Build the new trim: lease-calc name + MSRP + sellingPrice + inherited specs.
4. Keep any curated (non-EPA) detail trim that no style matched, so curation is
   never silently dropped. Drop the EPA-injected junk trims (specsSource ==
   'us_epa', null MSRP) — the lease-calc list supersedes them.
5. Sort trims by MSRP ascending (so the default/first trim is the real base),
   set msrpFrom = cheapest trim, headline range = longest trim range.
6. Mirror msrpFrom + rangeEpa into vehicles_summary.json (the cards).

SAFETY
------
• Only touches files that have lease-calc styles; others are reported "skipped".
• --dry-run prints a per-file diff and writes nothing.

RUN
---
    python scraper/processors/lease_trim_sync.py --dry-run
    python scraper/processors/lease_trim_sync.py
    python scraper/processors/lease_trim_sync.py --only hyundai-ioniq-9-2025
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
LEASE_CALC = DATA_DIR / "lease_calc_by_vehicle.json"
SUMMARY = DATA_DIR / "vehicles_summary.json"

# Tokens to strip from an Edmunds style label to get a clean display name.
_BODY_RE = re.compile(
    r"\b(electric dd|electric|dd|\d?dr|suv|sedan|hatchback|wagon|truck|van|"
    r"minivan|coupe|crew cab|cab|ext|sb|lb|high roof|low roof|fastback)\b",
    re.I,
)
# Noise tokens dropped when building a trim "signature" for matching.
_SIG_DROP = {
    "electric", "dd", "suv", "sedan", "hatchback", "wagon", "truck", "van",
    "minivan", "coupe", "crew", "cab", "sb", "lb", "4wd", "with", "w", "tow",
    "hitch", "prod", "end", "mi", "battery", "pack", "max", "large", "standard",
    "range", "ext", "roof", "high", "low", "dr", "4dr", "2dr", "3dr", "fastback",
}


def _clean_name(label: str) -> str:
    """'SE 4dr SUV AWD (electric DD)' -> 'SE AWD'."""
    s = re.sub(r"\(.*?\)", " ", label or "")        # drop parentheticals
    s = _BODY_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or (label or "").strip() or "Base"


def _drivetrain(label: str) -> str | None:
    L = (label or "").upper()
    if "AWD" in L or "4MATIC" in L or "4WD" in L or "E-4ORCE" in L:
        return "AWD"
    if "FWD" in L:
        return "FWD"
    if "RWD" in L:
        return "RWD"
    return None


def _sig(name: str) -> set[str]:
    """Token set for fuzzy trim matching; collapses drivetrain + drops noise."""
    s = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    toks = {t for t in s.split() if t and t not in _SIG_DROP}
    if "awd" in toks or "4motion" in toks or "4matic" in toks:
        toks.discard("4motion"); toks.discard("4matic"); toks.add("awd")
    elif "fwd" not in toks and "rwd" not in toks:
        toks.add("rwd")  # EVs default to RWD when no drivetrain word is present
    return toks


def _style_price(style: dict) -> tuple[float | None, float | None]:
    """(msrp, sellingPrice) from a style, preferring the 36-mo entry."""
    for term in ("36", "24"):
        e = style.get(term) or {}
        if e.get("msrp"):
            return e.get("msrp"), (e.get("sellingPrice") or e.get("msrp"))
    return None, None


def _best_match(style_label: str, curated: list[dict]) -> dict | None:
    """Closest curated/EPA detail trim to a lease-calc style, by drivetrain +
    token overlap. Returns None if nothing overlaps."""
    want = _sig(style_label)
    want_dt = _drivetrain(style_label)
    best, best_score = None, 0.0
    for ct in curated:
        ct_dt = (ct.get("drivetrain") or "").upper() or None
        cand = _sig(ct.get("name", ""))
        inter = len(want & cand)
        union = len(want | cand) or 1
        score = inter / union
        # Reward a drivetrain match so an AWD style prefers an AWD trim.
        if want_dt and ct_dt and want_dt == ct_dt:
            score += 0.25
        if score > best_score:
            best_score, best = score, ct
    return best if best_score >= 0.3 else None


def _inherit_specs(matched: dict | None, curated: list[dict], dt: str | None) -> dict:
    """Specs (range/efficiency/horsepower) for a new trim: prefer the matched
    trim, else the closest same-drivetrain curated trim, else any with specs."""
    if matched and matched.get("specs"):
        return dict(matched["specs"])
    same_dt = [c for c in curated if (c.get("drivetrain") or "").upper() == (dt or "")]
    for pool in (same_dt, curated):
        for c in pool:
            if c.get("specs"):
                return dict(c["specs"])
    return {}


def sync_file(detail: dict, styles: dict, file_id: str) -> tuple[dict, list[str]]:
    """Return (updated_detail, change_notes). Pure — no disk I/O."""
    notes: list[str] = []
    curated = list(detail.get("trims") or [])
    # Curated trims worth preserving if no style matches them (real, priced).
    real_curated = [c for c in curated if c.get("specsSource") != "us_epa" and c.get("msrp")]

    new_trims: list[dict] = []
    matched_ids: set[int] = set()
    for label, style in styles.items():
        msrp, selling = _style_price(style)
        if not msrp:
            continue
        matched = _best_match(label, curated)
        if matched is not None:
            matched_ids.add(id(matched))
        dt = _drivetrain(label) or (matched.get("drivetrain") if matched else None) or "RWD"
        # Use the cleaned Edmunds style name — it's the accurate, distinct trim
        # label ("Performance Calligraphy AWD" vs "...Design AWD"). We do NOT
        # borrow the matched trim's name: the matches are fuzzy, so that would
        # collapse distinct styles onto one name or inherit EPA junk names.
        name = _clean_name(label)
        new_trims.append({
            "name": name,
            "msrp": round(msrp),
            "sellingPrice": round(selling) if selling else None,
            "drivetrain": dt,
            "specs": _inherit_specs(matched, curated, dt),
            "availableColors": (matched or {}).get("availableColors", []),
            "cashOffers": (matched or {}).get("cashOffers", []),
            "financeOffers": (matched or {}).get("financeOffers", []),
            "leaseOffers": (matched or {}).get("leaseOffers", []),
            "specsSource": "edmunds-lease-calc",
            "styleLabel": label,
        })

    if not new_trims:
        return detail, []

    # Keep curated trims that no style matched (don't silently drop curation).
    for c in real_curated:
        if id(c) not in matched_ids:
            new_trims.append(c)
            notes.append(f"kept unmatched curated trim '{c.get('name')}'")

    # Sort cheapest-first so the default (index 0) is the real base trim.
    new_trims.sort(key=lambda t: t.get("msrp") or 1e12)

    old_n = len(curated)
    detail["trims"] = new_trims
    notes.append(f"trims {old_n} -> {len(new_trims)} (from lease-calc styles)")

    # msrpFrom = cheapest trim.
    msrps = [t["msrp"] for t in new_trims if t.get("msrp")]
    if msrps:
        new_from = min(msrps)
        if detail.get("msrpFrom") != new_from:
            notes.append(f"msrpFrom {detail.get('msrpFrom')} -> {new_from}")
        detail["msrpFrom"] = new_from

    # Headline range = longest trim range.
    ranges = [(t.get("specs") or {}).get("range") for t in new_trims]
    ranges = [r for r in ranges if r]
    if ranges:
        specs = dict(detail.get("specs") or {})
        specs["range"] = max(ranges)
        detail["specs"] = specs
        detail["_maxRange"] = max(ranges)

    return detail, notes


def _sync_summary(file_id: str, msrp_from, max_range, dry_run: bool) -> bool:
    if not SUMMARY.exists():
        return False
    rows = json.loads(SUMMARY.read_text("utf-8"))
    changed = False
    for row in rows:
        if row.get("id") != file_id:
            continue
        if msrp_from and row.get("msrpFrom") != msrp_from:
            row["msrpFrom"] = msrp_from; changed = True
        if max_range and row.get("rangeEpa") != max_range:
            row["rangeEpa"] = max_range; changed = True
    if changed and not dry_run:
        SUMMARY.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return changed


def run(only: str | None = None, dry_run: bool = False) -> dict:
    if not LEASE_CALC.exists():
        return {"ok": False, "error": f"missing {LEASE_CALC} — run scrape_lease_calculator.py first"}
    lease = json.loads(LEASE_CALC.read_text("utf-8")).get("vehicles", {})

    report = {"updated": [], "skipped": [], "dryRun": dry_run}
    for fp in sorted(VEHICLES_DIR.glob("*.json")):
        file_id = fp.stem
        if only and file_id != only:
            continue
        styles = (lease.get(file_id) or {}).get("styles") or {}
        if not styles:
            report["skipped"].append({"id": file_id, "reason": "no lease-calc styles"})
            continue
        detail = json.loads(fp.read_text("utf-8"))
        updated, notes = sync_file(detail, styles, file_id)
        max_range = updated.pop("_maxRange", None)
        if not notes:
            report["skipped"].append({"id": file_id, "reason": "already in sync"})
            continue
        if not dry_run:
            fp.write_text(json.dumps(updated, indent=2, ensure_ascii=False), encoding="utf-8")
        _sync_summary(file_id, updated.get("msrpFrom"), max_range, dry_run)
        report["updated"].append({"id": file_id, "changes": notes})
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync detail-file trims from the Edmunds lease calculator.")
    ap.add_argument("--only", help="Only process this detail-file id (e.g. hyundai-ioniq-9-2025)")
    ap.add_argument("--dry-run", action="store_true", help="Print diffs, write nothing")
    args = ap.parse_args()

    report = run(only=args.only, dry_run=args.dry_run)
    print(json.dumps(report, indent=2))
    if report.get("updated"):
        print(f"\n{'[dry-run] would update' if args.dry_run else 'Updated'} "
              f"{len(report['updated'])} file(s); skipped {len(report['skipped'])}.")


if __name__ == "__main__":
    main()
