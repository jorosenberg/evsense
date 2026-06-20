#!/usr/bin/env python3
"""
fill_vehicle_overrides.py — Auto-populate vehicle_overrides.yaml with EPA trim data.

Data sources (in priority order for each field):
  1. Existing vehicle detail JSON  (frontend/public/data/vehicles/<id>.json)
     — has curated trims; some specs already present
  2. EPA catalog                   (frontend/public/data/us_ev_catalog.json)
     — per-trim range_mi, efficiency_mi_per_kwh, drivetrain, horsepower_est
  3. vehicles_summary.json         (summary-level rangeEpa, milesPerKwh)
     — fallback when nothing else is available

Existing override entries are PRESERVED (scores, notes, manual trims).
This script only fills in the gaps.

Usage:
    python fill_vehicle_overrides.py              # write updated YAML
    python fill_vehicle_overrides.py --dry-run    # preview without writing
    python fill_vehicle_overrides.py --show-gaps  # list trims still missing data
"""

from __future__ import annotations

import os
import sys

# Force UTF-8 stdout on Windows so box-drawing chars in the YAML header don't crash.
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

# ── Paths ──────────────────────────────────────────────────────────────────
SCRAPER_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT  = SCRAPER_DIR.parent
DATA_DIR      = PROJECT_ROOT / "frontend" / "public" / "data"
VEHICLES_DIR  = DATA_DIR / "vehicles"
OVERRIDES_OUT = SCRAPER_DIR / "overrides" / "vehicle_overrides.yaml"

# Known 0-60 times not in EPA data (curated from manufacturer specs / Car and Driver)
ZERO_TO_SIXTY: dict[str, dict[str, float]] = {
    # vehicle-id → { normalized-trim-name → seconds }
    "chevrolet-blazer-ev-2025": {
        "lt fwd": 6.5, "rs rwd": 5.7, "rs awd": 5.1, "ss awd": 3.4,
    },
    "chevrolet-equinox-ev-2025": {
        "1lt fwd": 7.8, "2lt awd": 6.8, "rs awd": 6.5,
    },
    "chevrolet-silverado-ev-2025": {
        "work truck": 8.5, "lt": 5.9, "rst": 4.5,
    },
    "ford-e-transit-2025": {
        "cargo van low roof": 10.0, "cargo van medium roof er": 10.0,
    },
    "hyundai-ioniq-6-2025": {
        "se standard range rwd": 7.4, "se long range rwd": 7.4, "limited awd": 5.1,
    },
    "polestar-polestar-2-2025": {
        "long range single motor": 6.4, "long range dual motor": 4.5, "bst edition 270": 3.6,
    },
    "polestar-polestar-3-2025": {
        "long range single motor": 7.7, "long range dual motor": 5.0, "performance pack": 4.7,
    },
    "polestar-polestar-4-2025": {
        "long range single motor": 7.4, "long range dual motor": 4.4, "performance pack": 3.8,
    },
    "ford-mustang-mach-e-2025": {
        "select rwd": 7.0, "premium rwd": 6.8, "premium awd": 5.2,
        "california route 1": 6.8, "gt": 3.7, "rally": 3.7,
    },
    "ford-f-150-lightning-2025": {
        "pro": 7.0, "xlt": 4.5, "lariat": 4.5, "platinum": 4.0,
    },
    "rivian-r1t-2025": {
        "standard": 4.5, "adventure": 3.0, "performance": 2.6,
        "dual-motor standard": 4.5, "dual-motor adventure": 3.0, "quad-motor performance": 2.6,
    },
    "rivian-r1s-2025": {
        "standard": 4.5, "adventure": 3.0, "performance": 2.6,
        "dual-motor standard": 4.5, "dual-motor adventure": 3.0, "quad-motor performance": 2.6,
    },
    "tesla-models-2025": {
        "plaid": 1.99, "long range": 3.1, "long range awd": 3.1,
    },
    "tesla-modelx-2025": {
        "plaid": 2.5, "long range": 3.8,
    },
    "tesla-cybertruck-2025": {
        "rwd": 6.5, "awd": 4.1, "cyberbeast": 2.6,
    },
    "lucid-air-2025": {
        "pure": 4.5, "touring": 3.0, "grand touring": 3.0,
        "grand touring performance": 2.6, "sapphire": 1.89,
    },
    "lucid-gravity-2025": {
        "grand touring": 3.5, "performance": 3.0, "sapphire": 2.0,
    },
    "bmw-i4-2025": {
        "edrive35": 6.0, "edrive40": 5.5, "m50": 3.7,
        "edrive35 gran coupe": 6.0, "xdrive40 gran coupe": 5.5, "m50 gran coupe": 3.7,
        "m60 xdrive gran coupe": 3.3,
    },
    "bmw-i5-2025": {
        "edrive40": 5.7, "m60 xdrive": 3.7, "touring edrive40": 5.9, "m60 xdrive touring": 3.9,
    },
    "bmw-i7-2025": {
        "xdrive60": 4.5, "m70 xdrive": 3.5,
    },
    "bmw-ix-2025": {
        "xdrive40": 6.1, "xdrive50": 4.6, "m60": 3.6,
    },
    "volkswagen-id4-2025": {
        "standard": 8.5, "pro": 7.9, "pro s": 7.9, "pro 4motion": 5.7, "gtx": 5.5,
    },
    "volkswagen-id-buzz-2025": {
        "pro": 7.9, "pro s": 7.9, "pro 4motion": 6.5,
    },
    "hyundai-ioniq-9-2025": {
        "se": 8.0, "sel": 7.5, "limited": 7.5, "performance": 4.2,
    },
    "kia-ev6-2025": {
        "light rwd": 7.5, "wind awd": 5.0, "gt-line awd": 4.6, "gt awd": 3.4,
    },
    "kia-ev9-2025": {
        "light rwd": 8.0, "wind rwd": 8.0, "wind awd": 5.3, "land": 5.3, "gt-line awd": 5.3,
    },
    "rivian-r2-2025": {
        "single motor": 6.5, "dual motor": 4.5, "launch edition": 4.5,
    },
    "mercedes-benz-cla-2026": {
        "cla 250+": 6.6, "cla 350 4matic": 4.8,
    },
    "toyota-bz-2026": {
        "xle fwd": 8.6, "xle plus fwd": 7.5, "xle plus awd": 4.9,
        "limited fwd": 7.5, "limited awd": 4.9,
    },
}

# Battery kWh not in EPA data (curated from manufacturer specs)
BATTERY_KWH: dict[str, dict[str, float]] = {
    "chevrolet-blazer-ev-2025": {
        "lt fwd": 102, "rs rwd": 102, "rs awd": 102, "ss awd": 102,
    },
    "chevrolet-equinox-ev-2025": {
        "1lt fwd": 85, "2lt awd": 85, "rs awd": 85,
    },
    "chevrolet-silverado-ev-2025": {
        "work truck": 170, "lt": 200, "rst": 200,
    },
    "ford-e-transit-2025": {
        "cargo van low roof": 89, "cargo van medium roof er": 89,
    },
    "hyundai-ioniq-6-2025": {
        "se standard range rwd": 53, "se long range rwd": 77.4, "limited awd": 77.4,
    },
    "polestar-polestar-2-2025": {
        "long range single motor": 82, "long range dual motor": 82, "bst edition 270": 82,
    },
    "polestar-polestar-3-2025": {
        "long range single motor": 111, "long range dual motor": 111, "performance pack": 111,
    },
    "polestar-polestar-4-2025": {
        "long range single motor": 100, "long range dual motor": 100, "performance pack": 100,
    },
}

# Trim-level range overrides for vehicles not present in the EPA catalog
# (or whose EPA catalog entry lacks per-trim data).
# Source: fueleconomy.gov individual model pages, manufacturer specs.
TRIM_RANGE: dict[str, dict[str, tuple[int, float]]] = {
    # vehicle-id → { normalized-trim-name → (range_mi, mi_per_kwh) }
    "hyundai-ioniq-6-2025": {
        "se standard range rwd": (240, 4.53),
        "se long range rwd":     (361, 4.66),
        "limited awd":           (266, 3.44),
    },
    # Chevy Blazer EV — per-trim EPA ratings (fueleconomy.gov)
    "chevrolet-blazer-ev-2025": {
        "lt fwd":  (293, 3.58),
        "rs rwd":  (334, 3.79),
        "rs awd":  (279, 3.16),
        "ss awd":  (250, 2.78),
    },
    # Chevy Equinox EV — per-trim EPA ratings
    "chevrolet-equinox-ev-2025": {
        "1lt fwd":  (319, 3.83),
        "2lt awd":  (305, 3.66),
        "rs awd":   (305, 3.66),
    },
    # Silverado EV — WT range varies by battery; using EPA-rated values
    "chevrolet-silverado-ev-2025": {
        "work truck": (272, 1.60),
        "lt":         (440, 2.59),
        "rst":        (440, 2.59),
    },
    # Ford E-Transit — EPA range per variant
    "ford-e-transit-2025": {
        "cargo van low roof":       (126, 2.10),
        "cargo van medium roof er": (159, 2.64),
    },
    # Polestar 2 — per-trim EPA (2025 model year)
    "polestar-polestar-2-2025": {
        "long range single motor": (278, 3.39),
        "long range dual motor":   (248, 3.02),
        "bst edition 270":         (240, 2.93),
    },
    # Polestar 3 — per-trim EPA estimates
    "polestar-polestar-3-2025": {
        "long range single motor": (350, 3.15),
        "long range dual motor":   (315, 2.84),
        "performance pack":        (296, 2.67),
    },
    # Polestar 4 — per-trim EPA estimates
    "polestar-polestar-4-2025": {
        "long range single motor": (300, 3.00),
        "long range dual motor":   (270, 2.70),
        "performance pack":        (255, 2.55),
    },
    # Rivian R1S — priced commercial trims with correct per-pack ranges
    "rivian-r1s-2025": {
        "dual standard": (270, 2.51),
        "dual large":    (385, 2.58),
        "tri max":       (321, 2.14),
        "quad max":      (321, 2.14),
    },
    # Rivian R1T — same pack/range structure as R1S
    "rivian-r1t-2025": {
        "dual standard": (270, 2.51),
        "dual large":    (390, 2.60),
        "tri max":       (321, 2.14),
        "quad max":      (321, 2.14),
    },
    # Rivian R2
    "rivian-r2-2025": {
        "single motor":    (300, 3.03),
        "dual motor":      (260, 2.63),
        "launch edition":  (260, 2.63),
    },
}

# ── Helpers ────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Lowercase, strip punctuation, collapse spaces — for fuzzy matching."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _best_epa_trim(trim_name: str, epa_trims: list[dict]) -> Optional[dict]:
    """Return the EPA trim entry whose name best matches trim_name, or None."""
    if not epa_trims:
        return None
    scored = [(t, _similarity(trim_name, t["name"])) for t in epa_trims]
    best = max(scored, key=lambda x: x[1])
    return best[0] if best[1] >= 0.35 else None


def _round_maybe(v: Optional[float], digits: int = 2) -> Optional[float]:
    if v is None:
        return None
    return round(v, digits)


def _load_json(path: Path) -> dict | list:
    return json.loads(path.read_text("utf-8"))


# ── Data loading ───────────────────────────────────────────────────────────

def load_epa_catalog() -> dict[str, dict]:
    """Return EPA catalog indexed by normalized 'make model' key."""
    path = DATA_DIR / "us_ev_catalog.json"
    if not path.exists():
        return {}
    data = _load_json(path)
    idx: dict[str, dict] = {}
    for entry in data.get("vehicles", []):
        key = _norm(f"{entry['make']} {entry['model']}")
        # Keep highest-year entry when dupes exist
        if key not in idx or entry.get("year", 0) >= idx[key].get("year", 0):
            idx[key] = entry
    return idx


def load_summary() -> dict[str, dict]:
    path = DATA_DIR / "vehicles_summary.json"
    if not path.exists():
        return {}
    return {v["id"]: v for v in _load_json(path)}


def load_detail(vehicle_id: str) -> Optional[dict]:
    path = VEHICLES_DIR / f"{vehicle_id}.json"
    if not path.exists():
        return None
    return _load_json(path)


# ── Core: build one vehicle's override entry ──────────────────────────────

def build_vehicle_entry(
    vehicle_id: str,
    existing: dict,        # what's already in vehicle_overrides.yaml for this id
    epa_idx: dict[str, dict],
    summary: dict[str, dict],
) -> dict:
    detail   = load_detail(vehicle_id)
    sv       = summary.get(vehicle_id, {})

    # Start from a copy of whatever is already hand-curated
    out: dict = {}
    if existing.get("scores"):
        out["scores"] = existing["scores"]

    # Find best-matching EPA entry for this vehicle
    make_model_key = None
    epa_entry: Optional[dict] = None
    if detail:
        make = detail.get("make", "")
        model = detail.get("model", "")
        if make and model:
            make_model_key = _norm(f"{make} {model}")
            epa_entry = epa_idx.get(make_model_key)
            if not epa_entry:
                # Partial search: find best match
                best_score = 0.0
                for key, entry in epa_idx.items():
                    s = _similarity(make_model_key, key)
                    if s > best_score:
                        best_score = s
                        epa_entry = entry
                if best_score < 0.5:
                    epa_entry = None

    epa_trims: list[dict] = (epa_entry or {}).get("trims", [])
    sv_range   = sv.get("rangeEpa")
    sv_mpkwh   = sv.get("milesPerKwh")

    # Build trim list
    source_trims: list[dict] = []
    if existing.get("trims"):
        # Respect any already hand-curated trims
        source_trims = existing["trims"]
    elif detail and detail.get("trims"):
        source_trims = detail["trims"]

    if not source_trims:
        return out  # nothing to fill

    out_trims = []
    z60_map   = ZERO_TO_SIXTY.get(vehicle_id, {})
    batt_map  = BATTERY_KWH.get(vehicle_id, {})
    rng_map   = TRIM_RANGE.get(vehicle_id, {})

    for trim in source_trims:
        t: dict = {}
        name = trim.get("name", "")
        msrp = trim.get("msrp") or trim.get("specs", {}).get("msrp")

        # If the incoming trim already has full data AND this vehicle has no
        # curated TRIM_RANGE entry, pass through as-is (preserves hand-edits).
        # For vehicles with a TRIM_RANGE entry we always re-derive from the
        # curated table so stale auto-generated values get corrected.
        if (
            "name" in trim
            and all(k in trim for k in ("range", "milesPerKwh"))
            and not rng_map  # no curated per-trim overrides → trust existing
        ):
            out_trims.append(trim)
            continue

        # Pull existing specs
        specs = trim.get("specs", {})
        existing_range   = specs.get("range")   or trim.get("range")
        existing_mpkwh   = specs.get("milesPerKwh") or trim.get("milesPerKwh")
        existing_hp      = specs.get("horsepower") or trim.get("horsepower")
        existing_batt    = specs.get("batteryKwh") or trim.get("batteryKwh")
        existing_z60     = specs.get("zeroToSixty") or trim.get("zeroToSixty")
        existing_dt      = specs.get("drivetrain") or trim.get("drivetrain")

        # Match to EPA trim
        epa_t = _best_epa_trim(name, epa_trims)

        t["name"] = name
        if msrp:
            t["msrp"] = msrp

        # Drivetrain
        dt = existing_dt or (epa_t or {}).get("drivetrain")
        if not dt:
            # Infer from trim name
            nm = _norm(name)
            if "awd" in nm or "4motion" in nm or "4matic" in nm or "xdrive" in nm or "quattro" in nm:
                dt = "AWD"
            elif "fwd" in nm or "front" in nm:
                dt = "FWD"
            elif "rwd" in nm or "rear" in nm:
                dt = "RWD"
        if dt:
            t["drivetrain"] = dt

        # Range + efficiency — TRIM_RANGE is authoritative; it always wins
        # even over values saved from a previous script run. Vehicles not in
        # TRIM_RANGE fall back to: existing → EPA catalog → summary level.
        trim_override = rng_map.get(_norm(name))
        if trim_override:
            rng = trim_override[0]
            eff = trim_override[1]
        else:
            rng = existing_range or (epa_t or {}).get("range_mi") or sv_range
            eff = existing_mpkwh or (epa_t or {}).get("efficiency_mi_per_kwh") or sv_mpkwh

        if rng:
            t["range"] = int(rng)
        if eff:
            t["milesPerKwh"] = _round_maybe(eff, 2)

        # Battery kWh
        batt_key = _norm(name)
        batt = existing_batt or batt_map.get(batt_key)
        if not batt:
            batt_est = (epa_entry or {}).get("battery_kwh_estimate")
            if batt_est:
                batt = batt_est
        if batt:
            t["batteryKwh"] = _round_maybe(batt, 1)

        # Horsepower
        hp = existing_hp or (epa_t or {}).get("horsepower_est")
        if hp:
            t["horsepower"] = int(hp)

        # 0-60
        z60_key = _norm(name)
        z60 = existing_z60 or z60_map.get(z60_key)
        if z60:
            t["zeroToSixty"] = _round_maybe(z60, 1)

        out_trims.append(t)

    if out_trims:
        # Deduplicate by (name, range) — EPA data sometimes has identical rows
        seen: set[tuple] = set()
        deduped = []
        for t in out_trims:
            key = (t.get("name", ""), t.get("range"))
            if key not in seen:
                seen.add(key)
                deduped.append(t)
        out["trims"] = deduped

    return out


# ── YAML serialisation ─────────────────────────────────────────────────────

def _scalar(v) -> str:
    """Render a Python scalar as inline YAML."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        # Quote if contains special chars
        if any(c in v for c in ':#{}[]|>&*!,?'):
            return f'"{v}"'
        return v
    if isinstance(v, float):
        # Remove trailing zeros but keep at least one decimal
        s = f"{v:.2f}".rstrip("0")
        if s.endswith("."):
            s += "0"
        return s
    return str(v)


def _format_trim(t: dict) -> str:
    """Serialise a single trim as an inline flow mapping."""
    FIELD_ORDER = ["name", "msrp", "drivetrain", "range", "batteryKwh",
                   "milesPerKwh", "horsepower", "zeroToSixty"]
    parts = []
    for k in FIELD_ORDER:
        if k in t:
            parts.append(f"{k}: {_scalar(t[k])}")
    # Any extra keys not in the canonical order
    for k, v in t.items():
        if k not in FIELD_ORDER:
            parts.append(f"{k}: {_scalar(v)}")
    return "{ " + ", ".join(parts) + " }"


def _format_scores(scores: dict) -> list[str]:
    lines = ["    scores:"]
    for k, v in scores.items():
        lines.append(f"      {k}: {_scalar(v)}")
    return lines


def render_yaml(
    vehicles_data: dict[str, dict],
    vehicle_ids: list[str],
) -> str:
    lines = [
        "# ─────────────────────────────────────────────────────────────────────────────",
        "# vehicle_overrides.yaml — MANUAL OVERRIDES (authoritative)",
        "#",
        "# Anything you set here WINS over the scraped/curated data when",
        "# `apply_overrides.py` runs (part of the pipeline). The rest of the scraping",
        "# (EPA catalog, NHTSA radar, incentives, GCC scores) is unchanged — this only",
        "# overrides the fields you fill in.",
        "#",
        "# • Keys under `vehicles:` are app vehicle IDs (the same id used in",
        "#   frontend/public/data/vehicles/<id>.json and vehicles_summary.json).",
        "# • Leave a car as `{}` to apply NO override (it keeps its scraped data).",
        "# • Full field reference + examples: OVERRIDES_REFERENCE.md",
        "# • Trims without an MSRP are hidden from the site (Edmunds-style: no price →",
        "#   not shown). Toggle per car with `hideUnpricedTrims`, or globally in",
        "#   `defaults`.",
        "# ─────────────────────────────────────────────────────────────────────────────",
        "",
        "defaults:",
        "  hideUnpricedTrims: true   # drop trims that have no msrp (no price data)",
        "",
        "vehicles:",
        "",
    ]

    for vid in vehicle_ids:
        entry = vehicles_data.get(vid, {})
        lines.append(f"  {vid}:")

        if not entry:
            lines[-1] += " {}"
            lines.append("")
            continue

        if "scores" in entry:
            lines.extend(_format_scores(entry["scores"]))

        if "trims" in entry:
            lines.append("    trims:")
            for trim in entry["trims"]:
                lines.append(f"      - {_format_trim(trim)}")

        lines.append("")

    return "\n".join(lines)


# ── Existing YAML parser (minimal — just enough to extract our fields) ─────

def parse_existing_yaml(path: Path) -> dict[str, dict]:
    """
    Extremely lightweight parser for our specific YAML format.
    Only extracts `scores` and `trims` per vehicle — ignores defaults/comments.
    For a real project this should use pyyaml; we keep it dependency-free here.
    """
    try:
        import yaml  # type: ignore
        with path.open("r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}
        result: dict[str, dict] = {}
        for vid, vdata in (raw.get("vehicles") or {}).items():
            if not vdata:
                result[vid] = {}
                continue
            entry: dict = {}
            if "scores" in vdata:
                entry["scores"] = vdata["scores"]
            if "trims" in vdata:
                # Normalise trim dicts
                trims = []
                for t in vdata["trims"]:
                    if isinstance(t, dict):
                        trims.append(t)
                entry["trims"] = trims
            result[vid] = entry
        return result
    except ImportError:
        pass

    # Fallback: line-by-line (handles the simple format we produce)
    result = {}
    current_id: Optional[str] = None
    in_trims = False
    lines = path.read_text("utf-8").splitlines()

    for line in lines:
        stripped = line.rstrip()
        if not stripped or stripped.lstrip().startswith("#"):
            continue

        # vehicle ID line: "  some-vehicle-id:"
        vid_m = re.match(r"^  ([a-z0-9][a-z0-9-]+):\s*(\{\})?", stripped)
        if vid_m:
            current_id = vid_m.group(1)
            if current_id not in ("defaults",):
                result[current_id] = {}
            in_trims = False
            continue

        if current_id is None:
            continue

        # trims section header
        if re.match(r"^    trims:", stripped):
            result[current_id]["trims"] = []
            in_trims = True
            continue

        # trim line: "      - { name: ..., msrp: ..., ... }"
        if in_trims and re.match(r"^      - \{", stripped):
            inner = re.sub(r"^      - \{|\}$", "", stripped).strip()
            trim: dict = {}
            for pair in re.split(r",\s*(?=[a-zA-Z])", inner):
                kv = pair.split(":", 1)
                if len(kv) == 2:
                    k, v = kv[0].strip(), kv[1].strip().strip('"')
                    try:
                        trim[k] = int(v)
                    except ValueError:
                        try:
                            trim[k] = float(v)
                        except ValueError:
                            trim[k] = v
            result[current_id].setdefault("trims", []).append(trim)
            continue

        in_trims = False

    return result


# ── CLI ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Fill vehicle_overrides.yaml from EPA + curated data")
    ap.add_argument("--dry-run", action="store_true", help="Print YAML to stdout, don't write")
    ap.add_argument("--show-gaps", action="store_true", help="List trims still missing range after fill")
    ap.add_argument("--vehicle", default=None, metavar="ID",
                    help="Only process this vehicle (useful for debugging)")
    args = ap.parse_args()

    print("Loading data sources…", file=sys.stderr)
    epa_idx  = load_epa_catalog()
    summary  = load_summary()
    existing = parse_existing_yaml(OVERRIDES_OUT) if OVERRIDES_OUT.exists() else {}

    print(f"  EPA catalog entries: {len(epa_idx)}", file=sys.stderr)
    print(f"  Summary vehicles:    {len(summary)}", file=sys.stderr)
    print(f"  Existing overrides:  {len(existing)}", file=sys.stderr)

    # Collect all vehicle IDs: existing overrides ∪ detail JSON files ∪ summary
    from_details = {f.stem for f in VEHICLES_DIR.glob("*.json")}
    from_summary = set(summary.keys())
    from_overrides = set(existing.keys())
    all_ids = sorted(from_details | from_summary | from_overrides)

    if args.vehicle:
        all_ids = [v for v in all_ids if v == args.vehicle]
        if not all_ids:
            print(f"Vehicle '{args.vehicle}' not found.", file=sys.stderr)
            sys.exit(1)

    print(f"  Processing {len(all_ids)} vehicles…\n", file=sys.stderr)

    vehicles_data: dict[str, dict] = {}
    gaps: list[str] = []

    for vid in all_ids:
        entry = build_vehicle_entry(
            vid,
            existing=existing.get(vid, {}),
            epa_idx=epa_idx,
            summary=summary,
        )
        vehicles_data[vid] = entry

        # Report gaps
        for trim in entry.get("trims", []):
            if not trim.get("range"):
                gaps.append(f"  {vid}  /  {trim.get('name','?')}  — MISSING range")

    if args.show_gaps:
        if gaps:
            print("Trims still missing range after fill:")
            for g in gaps:
                print(g)
        else:
            print("No gaps — all trims have range data.")
        return

    yaml_out = render_yaml(vehicles_data, all_ids)

    if args.dry_run:
        print(yaml_out)
        return

    OVERRIDES_OUT.parent.mkdir(parents=True, exist_ok=True)
    OVERRIDES_OUT.write_text(yaml_out, encoding="utf-8")
    print(f"Written → {OVERRIDES_OUT}", file=sys.stderr)

    if gaps:
        print(f"\n⚠  {len(gaps)} trim(s) still lack range data:", file=sys.stderr)
        for g in gaps:
            print(g, file=sys.stderr)
    else:
        print("✓  All trims have range data.", file=sys.stderr)


if __name__ == "__main__":
    main()
