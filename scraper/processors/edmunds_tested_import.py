"""
edmunds_tested_import.py — Import Edmunds EV Range Test results.

Edmunds' "Electric Car Range and Consumption" page embeds a JSON blob with, per
tested vehicle:
    vehicleName               e.g. "2026 Tesla Model Y Standard"
    range-EpaEstimateValue    EPA range, mi
    range-EdmundsTestedValue  Edmunds real-world tested range, mi
    consumption-EdmundsTested…  tested consumption, kWh/100mi (optional)

This parses that page (saved HTML — no network/Akamai), matches each row to one
of our app vehicles by make+model, and writes:

    frontend/public/data/tested_specs.json
      { "vehicles": { "<appId>": {
            "testedRange": 337, "epaRange": 321,
            "testedConsumption": 24.0, "sourceName": "2026 Tesla Model Y Standard"
        } } }

Matching is model-level: among all tested trims of a model we keep the one with
the LONGEST tested range (matches the site's "up to X mi" headline). Only models
that actually appear in the page get a tested figure — everything else is left
untouched (the app falls back to EPA range).

RUN
---
    python scraper/processors/edmunds_tested_import.py --html "<path to saved .htm>"
    python scraper/processors/edmunds_tested_import.py --html page.htm --debug
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUT_PATH = DATA_DIR / "tested_specs.json"
SUMMARY_PATH = DATA_DIR / "vehicles_summary.json"

_NAME_RE = re.compile(r'vehicleName":"([^"]+)"')
_EPA_RE = re.compile(r'range-EpaEstimateValue":"(\d+)"')
_TESTED_RE = re.compile(r'range-EdmundsTestedValue":"(\d+)"')
_CONS_RE = re.compile(r'consumption-EdmundsTested(?:Value|Calculation)?":"([\d.]+)')


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _first(rx: re.Pattern, text: str):
    m = rx.search(text)
    return m.group(1) if m else None


def parse_html(html: str, debug: bool = False) -> list[dict]:
    """Return [{name, epa, tested, consumption}] for every tested vehicle."""
    entries: dict[str, dict] = {}
    for m in _NAME_RE.finditer(html):
        name = m.group(1)
        if not re.match(r"\d{4}\s", name):   # only "YYYY Make Model …" rows
            continue
        # The range fields sit just AFTER the vehicleName in each object; look
        # forward a bounded window and take the first occurrence of each.
        post = html[m.end(): m.end() + 800]
        tested = _first(_TESTED_RE, post)
        epa = _first(_EPA_RE, post)
        if not tested:
            continue
        if name in entries:
            continue
        entries[name] = {
            "name": name,
            "tested": int(tested),
            "epa": int(epa) if epa else None,
            "consumption": None,
        }
    rows = list(entries.values())
    if debug:
        print(f"Parsed {len(rows)} tested vehicles. Sample: {rows[:3]}")
    return rows


def _load_app_vehicles() -> list[dict]:
    if not SUMMARY_PATH.exists():
        return []
    return [v for v in json.loads(SUMMARY_PATH.read_text("utf-8"))
            if v.get("id") and v.get("make") and v.get("model")]


def match_to_app(rows: list[dict], app_vehicles: list[dict], debug: bool = False) -> dict:
    """appId → best tested entry (longest tested range for that make+model)."""
    out: dict[str, dict] = {}
    for v in app_vehicles:
        key = _norm(f"{v['make']}{v['model']}")
        if not key:
            continue
        # candidate Edmunds rows whose name contains this make+model
        cands = [r for r in rows if key in _norm(re.sub(r"^\d{4}\s", "", r["name"]))]
        if not cands:
            continue
        best = max(cands, key=lambda r: r["tested"])
        out[v["id"]] = {
            "testedRange": best["tested"],
            "epaRange": best["epa"],
            "testedConsumption": best["consumption"],
            "sourceName": best["name"],
        }
        if debug:
            print(f"  {v['id']} ← {best['name']}  tested={best['tested']} epa={best['epa']}")
    return out


def run(html_path: str, dry_run: bool = False, debug: bool = False) -> dict:
    html = Path(html_path).read_text("utf-8", errors="replace")
    rows = parse_html(html, debug=debug)
    matched = match_to_app(rows, _load_app_vehicles(), debug=debug)
    payload = {
        "source": "edmunds.com EV Range Test",
        "importedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "parsedCount": len(rows),
        "matchedCount": len(matched),
        "vehicles": matched,
    }
    if not dry_run:
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def main() -> None:
    ap = argparse.ArgumentParser(description="Import Edmunds tested-range HTML → tested_specs.json")
    ap.add_argument("--html", required=True, help="Path to the saved Edmunds range-test .htm file")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()
    payload = run(args.html, dry_run=args.dry_run, debug=args.debug)
    print(f"{'[dry-run] ' if args.dry_run else ''}parsed {payload['parsedCount']}, "
          f"matched {payload['matchedCount']} app vehicles → {OUT_PATH.name}")


if __name__ == "__main__":
    main()
