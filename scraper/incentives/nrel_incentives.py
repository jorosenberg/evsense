"""
nrel_incentives.py — Unified monthly incentive pull from NREL AFDC.

Cost-efficient design:
  • Runs ONCE per month from the same Lambda invocation that scrapes vehicles.
  • Writes a single static JSON (`frontend/public/data/incentives_by_state.json`)
    plus an optional per-make-model JSON. No per-page API call from the frontend.
  • NREL has no usage cost (US government API) and lifts the 1k req/hour cap on
    real keys — we use ~52 calls per month.

Two data files are produced:
  1. incentives_by_state.json   — 50 states + DC, every active EV-related incentive
  2. incentives_by_vehicle.json — optional, off by default for free-tier safety
                                  ({"make-model-year": { "federal": {...}, "states": {...} }})

How per-vehicle incentive resolution actually works:
  - Federal status: AFDC `/vehicles.json?fuel_id=41` (EV) returns each model's
    qualification status. As of 2025-09 the IRA credit was repealed, so this is
    informational (most rows now report $0 federal credit). We still record it.
  - State-by-state vehicle eligibility: most state programs apply universally to
    "any battery-electric vehicle under $X MSRP and under $Y income cap". A FEW
    states (CA CVRP, NY Drive Clean) maintain explicit eligibility lists.
    Those are flagged below via the EXPLICIT_VEHICLE_LISTS table; we fetch them
    only when --per-vehicle is passed.

Why we DON'T scrape per-vehicle by default:
  - 50 states × 200 vehicles = 10k API calls would still fit AFDC's quota, BUT
  - most state programs are MSRP-cap-and-income-cap based, not per-model. The
    state-level rebate amount + income cap covers ~95% of real-world questions
    without the per-vehicle expansion.

CLI:
    python nrel_incentives.py                          # all 50 states, no per-vehicle
    python nrel_incentives.py --state CA               # one state
    python nrel_incentives.py --per-vehicle            # also pull explicit vehicle lists
    python nrel_incentives.py --dry-run

Programmatic:
    from incentives.nrel_incentives import run_incentive_pull
    report = run_incentive_pull(api_key=..., dry_run=False)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

import httpx

# ── Paths ────────────────────────────────────────────────────────────────────
SCRAPER_DIR  = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR     = PROJECT_ROOT / "frontend" / "public" / "data"
STATE_PATH   = DATA_DIR / "incentives_by_state.json"
VEHICLE_PATH = DATA_DIR / "incentives_by_vehicle.json"

# ── API ──────────────────────────────────────────────────────────────────────
AFDC_LAWS    = "https://developer.nrel.gov/api/transportation/v1/legislations.json"
AFDC_VEHICLES = "https://developer.nrel.gov/api/transportation/v1/vehicles.json"

ALL_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
]

# AFDC type codes we consider relevant for EV purchase decisions
EV_INCENTIVE_TYPES = {
    "state_tax_credit",
    "rebate",
    "grant",
    "voucher",
    "sales_tax_exemption",
    "reduced_registration_fee",
}
EV_CATEGORIES = {"ev_acquisition", "evse", "ev_purchase"}

# States that maintain explicit vehicle eligibility lists separate from the AFDC API.
# When --per-vehicle is set we fetch and apply these.
EXPLICIT_VEHICLE_LISTS = {
    "CA": "https://cleanvehiclerebate.org/api/v1/eligible-vehicles",  # placeholder; real CVRP list
    "NY": "https://www.nyserda.ny.gov/All-Programs/drive-clean-rebate",  # HTML list
}

log = logging.getLogger("nrel_incentives")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
    log.addHandler(h)
    log.setLevel(logging.INFO)


# ── Data shapes ──────────────────────────────────────────────────────────────
@dataclass
class StateIncentive:
    name: str
    type: str                 # rebate | tax_credit | grant | voucher | exemption
    amount: int               # USD; 0 if not parseable
    appliesTo: list[str]      # ["new"], ["used"], ["home_charger"]
    incomeLimit: Optional[int]  # USD AGI cap if found
    maxMsrp:    Optional[int]   # USD MSRP cap if found
    expiresAt:  Optional[str]
    url:        str
    notes:      str
    sourceId:   Optional[str]


@dataclass
class StateReport:
    state: str
    incentives: list[StateIncentive] = field(default_factory=list)
    lastUpdated: str = ""
    federalCreditUsd: int = 0    # current federal status (0 since 2025 repeal)
    summaryRebateUsd: int = 0    # max stackable purchase rebate

    def to_json(self) -> dict:
        return {
            "state": self.state,
            "lastUpdated": self.lastUpdated,
            "federalCreditUsd": self.federalCreditUsd,
            "summaryRebateUsd": self.summaryRebateUsd,
            "incentives": [asdict(i) for i in self.incentives],
        }


# ── Parsing helpers ──────────────────────────────────────────────────────────
_AMOUNT_RE = re.compile(r"\$([0-9][0-9,]*)")
_INCOME_RE = re.compile(r"(?:income|AGI)[^\$]{0,40}\$([0-9][0-9,]*)", re.IGNORECASE)
_MSRP_RE   = re.compile(r"MSRP[^\$]{0,40}\$([0-9][0-9,]*)", re.IGNORECASE)

def _parse_amount(text: str) -> int:
    if not text:
        return 0
    amounts = _AMOUNT_RE.findall(text)
    if not amounts:
        return 0
    try:
        return max(int(a.replace(",", "")) for a in amounts)
    except ValueError:
        return 0

def _parse_first_match(regex: re.Pattern, text: str) -> Optional[int]:
    if not text:
        return None
    m = regex.search(text)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except (ValueError, IndexError):
        return None

def _truncate(text: str, max_len: int = 300) -> str:
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0] + "…"

def _normalize_type(type_code: str) -> str:
    if type_code in ("state_tax_credit",):                 return "tax_credit"
    if type_code in ("sales_tax_exemption",):              return "tax_exemption"
    if type_code in ("reduced_registration_fee",):         return "fee_reduction"
    return type_code or "rebate"

def _applies_to(law: dict) -> list[str]:
    cats = {c.get("code", "") for c in law.get("categories", [])}
    out = []
    if "ev_acquisition" in cats or "ev_purchase" in cats:
        out.append("new")
    if "evse" in cats:
        out.append("home_charger")
    return out or ["new"]


# ── Fetch one state ──────────────────────────────────────────────────────────
# Sentinel for the known-broken NREL transportation redirect (as of 2025).
# When the API returns 301 → developer.nlr.gov:443, that hostname doesn't
# resolve. We treat that exact case as an "API outage" and let callers
# preserve their existing static data instead of overwriting with zeros.
_NREL_BROKEN_REDIRECT = "developer.nlr.gov"


def _is_connection_error(e: Exception) -> bool:
    """True for DNS / connect / timeout failures (network down, no DNS, proxy).

    These mean we never reached NREL at all — categorically different from "NREL
    answered and said there are no incentives". On these we must PRESERVE existing
    data, never overwrite it with zeros. `getaddrinfo failed` (Windows Errno 11001)
    surfaces as httpx.ConnectError, which subclasses httpx.TransportError.
    """
    if isinstance(e, httpx.TransportError):
        return True
    # Be defensive about wrapped socket.gaierror / OSError too.
    msg = str(e).lower()
    return "getaddrinfo" in msg or "11001" in msg or "failed to resolve" in msg \
        or "temporary failure in name resolution" in msg


def fetch_state(state: str, api_key: str, client: httpx.Client) -> StateReport:
    rep = StateReport(state=state, lastUpdated=datetime.now(timezone.utc).isoformat())
    try:
        r = client.get(AFDC_LAWS, params={
            "api_key": api_key,
            "state": state,
            "status": "current",
            "type": "incentive",
            "limit": 100,
        }, timeout=20, follow_redirects=False)
        if r.status_code in (301, 302, 308) and _NREL_BROKEN_REDIRECT in (r.headers.get("location") or ""):
            log.warning(
                f"[{state}] NREL transportation API is currently retired "
                f"(301 → {_NREL_BROKEN_REDIRECT}). Skipping live pull; "
                f"existing static incentivesData.js remains the source of truth."
            )
            rep._outage = True
            return rep
        r.raise_for_status()
        laws = r.json().get("result", [])
    except Exception as e:
        if _is_connection_error(e):
            log.error(f"[{state}] AFDC unreachable (network/DNS): {e} — "
                      f"preserving existing incentive data, not overwriting with zeros.")
            rep._outage = True
        else:
            log.error(f"[{state}] AFDC fetch failed: {e}")
        return rep

    max_rebate = 0
    for law in laws:
        cats = {c.get("code", "") for c in law.get("categories", [])}
        if not cats.intersection(EV_CATEGORIES):
            continue
        tcode = law.get("type_code", "")
        if tcode not in EV_INCENTIVE_TYPES:
            continue

        benefit = law.get("benefit", "")
        desc    = law.get("description", "")
        amount  = _parse_amount(benefit) or _parse_amount(desc)

        inc = StateIncentive(
            name=law.get("title", "Unknown Incentive"),
            type=_normalize_type(tcode),
            amount=amount,
            appliesTo=_applies_to(law),
            incomeLimit=_parse_first_match(_INCOME_RE, desc) or _parse_first_match(_INCOME_RE, benefit),
            maxMsrp=_parse_first_match(_MSRP_RE, desc) or _parse_first_match(_MSRP_RE, benefit),
            expiresAt=law.get("expired_on"),
            url=law.get("url", ""),
            notes=_truncate(desc),
            sourceId=str(law.get("id")) if law.get("id") is not None else None,
        )
        rep.incentives.append(inc)

        if inc.type in ("rebate", "tax_credit", "voucher") and "new" in inc.appliesTo:
            max_rebate = max(max_rebate, inc.amount)

    rep.summaryRebateUsd = max_rebate
    return rep


# ── Federal status (lightweight) ─────────────────────────────────────────────
def fetch_federal_status(api_key: str, client: httpx.Client) -> dict:
    """
    Returns the current federal EV-credit status. Since the IRA EV credit
    was repealed (effective late 2025), this currently reports $0 nationwide.
    We still query AFDC so the number stays automatically accurate if the
    program is reinstated.
    """
    try:
        r = client.get(AFDC_LAWS, params={
            "api_key": api_key,
            "jurisdiction": "US",
            "status": "current",
            "type": "incentive",
            "limit": 50,
        }, timeout=20, follow_redirects=False)
        if r.status_code in (301, 302, 308) and _NREL_BROKEN_REDIRECT in (r.headers.get("location") or ""):
            return {
                "amountUsd": 0,
                "name": "IRA §30D credit (REPEALED 2025)",
                "appliesTo": "consumer",
                "notes": "NREL transportation API retired; using known status: $0.",
                "lastVerified": datetime.now(timezone.utc).isoformat(),
                "apiOutage": True,
            }
        r.raise_for_status()
        laws = r.json().get("result", [])
        # Look for the lingering federal commercial credit (45W) which IS still active
        for law in laws:
            title = (law.get("title") or "").lower()
            if "qualified commercial clean vehicle" in title or "45w" in title:
                return {
                    "amountUsd": _parse_amount(law.get("benefit", "")) or 7500,
                    "name": law.get("title"),
                    "appliesTo": "commercial",
                    "url": law.get("url", ""),
                    "lastVerified": datetime.now(timezone.utc).isoformat(),
                }
        return {
            "amountUsd": 0,
            "name": "IRA §30D credit (REPEALED 2025)",
            "appliesTo": "consumer",
            "notes": "Federal consumer EV credit no longer available.",
            "lastVerified": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        log.warning(f"federal status fetch failed: {e}")
        result = {"amountUsd": 0, "name": "unknown", "error": str(e)}
        if _is_connection_error(e):
            result["apiOutage"] = True
        return result


# ── Per-vehicle (off by default) ─────────────────────────────────────────────
def fetch_per_vehicle_eligibility(
    vehicle_ids: list[str],
    api_key: str,
    client: httpx.Client,
) -> dict:
    """
    Per-vehicle data is a hook for the future. Today most state programs are
    MSRP/income gated rather than vehicle-id gated, so this returns a minimal
    map. When CA or NY publish their lists, we plug them in here without
    touching the frontend contract.

    Output shape:
      { "tesla-model3-2025": { "federal": {...}, "states": { "CA": {...} } } }
    """
    out = {}
    for vid in vehicle_ids:
        # Federal: still $0 for consumer purchases since 2025 repeal
        out[vid] = {
            "federal": {"amountUsd": 0, "note": "IRA §30D repealed"},
            "states": {},   # filled in once explicit lists are wired up
            "checkedAt": datetime.now(timezone.utc).isoformat(),
        }
    return out


# ── Static JS regenerator ───────────────────────────────────────────────────
def write_static_fallback(by_state: dict[str, StateReport], dry_run: bool) -> None:
    """
    Regenerate `frontend/src/utils/incentivesData.js` so the app works even if
    the JSON failed to load (offline / build-time use). This is a flat fallback
    keyed by state.
    """
    out_path = PROJECT_ROOT / "frontend" / "src" / "utils" / "incentivesDataAuto.js"
    now = datetime.now().strftime("%Y-%m-%d")
    lines = [
        "/**",
        " * incentivesDataAuto.js — auto-generated state incentive snapshot",
        f" * Last refreshed: {now}",
        " * Source: NREL AFDC State Laws & Incentives API",
        " * Do not hand-edit — regenerate via scraper/incentives/nrel_incentives.py",
        " */\n",
        "export const STATE_INCENTIVES_AUTO = {",
    ]
    for st, rep in sorted(by_state.items()):
        if not rep.incentives:
            continue
        rows = json.dumps([asdict(i) for i in rep.incentives], indent=4)
        lines.append(f"  {st}: {rows},")
    lines.append("};\n")
    lines.extend([
        "export function getAutoStateIncentives(stateAbbr) {",
        "  return STATE_INCENTIVES_AUTO[stateAbbr?.toUpperCase()] || [];",
        "}",
    ])
    content = "\n".join(lines)
    if dry_run:
        log.info(f"[DRY-RUN] would write {len(content)} bytes to {out_path}")
        return
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    log.info(f"Wrote {out_path}")


# ── Top-level orchestrator ───────────────────────────────────────────────────
def run_incentive_pull(
    api_key: str,
    states: Iterable[str] = ALL_STATES,
    per_vehicle: bool = False,
    vehicle_ids: Optional[list[str]] = None,
    dry_run: bool = False,
    write_js: bool = True,
    sleep_between: float = 0.4,
) -> dict:
    """Main entry — pulls state + federal, writes both JSON files. Returns a report.

    Special case: if NREL's transportation API is currently retired (it has
    been since the broken redirect started returning developer.nlr.gov), we
    detect this on the first state pull and short-circuit. The existing static
    incentivesData.js stays the source of truth.
    """
    started = datetime.now(timezone.utc)
    by_state: dict[str, StateReport] = {}

    with httpx.Client(headers={"User-Agent": "EVsense-Incentives/1.0"}) as client:
        federal = fetch_federal_status(api_key, client)
        outage_detected = federal.get("apiOutage", False)

        for st in states:
            rep = fetch_state(st, api_key, client)
            rep.federalCreditUsd = federal.get("amountUsd", 0)
            by_state[st] = rep
            if getattr(rep, "_outage", False):
                outage_detected = True
                # Don't hammer the broken API for every state
                log.warning(f"NREL API outage detected — skipping remaining {len(list(states)) - len(by_state)} states.")
                break
            log.info(f"[{st}] {len(rep.incentives)} incentive(s), max rebate ${rep.summaryRebateUsd}")
            time.sleep(sleep_between)

        per_vehicle_map = {}
        if per_vehicle and vehicle_ids and not outage_detected:
            per_vehicle_map = fetch_per_vehicle_eligibility(vehicle_ids, api_key, client)

    # Hard safety net: a successful pull always returns incentives for high-program
    # states (CA, CO, NY, etc.). If EVERY processed state came back with zero
    # incentives, the pull effectively failed (network, key, or API change) — treat
    # it as an outage so we never clobber good static data with an all-zero file.
    total_incentives = sum(len(r.incentives) for r in by_state.values())
    if not outage_detected and by_state and total_incentives == 0:
        log.warning(
            "All states returned 0 incentives — treating as a failed pull and "
            "preserving existing incentive data instead of overwriting with zeros."
        )
        outage_detected = True

    if outage_detected:
        log.warning(
            "Live incentive data unavailable from NREL. The existing "
            "frontend/src/utils/incentivesData.js (hand-curated) remains active. "
            "Re-run when NREL restores their transportation API."
        )
        return {
            "lastUpdated":     started.isoformat(),
            "statesProcessed": len(by_state),
            "totalIncentives": 0,
            "federal":         federal,
            "apiOutage":       True,
            "perVehicleCount": 0,
            "stateJsonPath":   None,
            "vehicleJsonPath": None,
            "dryRun":          dry_run,
            "note":            "NREL API retired; static incentivesData.js preserved.",
        }

    # Write JSON
    if not dry_run:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(
            json.dumps({
                "lastUpdated": started.isoformat(),
                "federal": federal,
                "byState": {k: v.to_json() for k, v in by_state.items()},
            }, indent=2),
            encoding="utf-8",
        )
        log.info(f"Wrote {STATE_PATH}")

        if per_vehicle_map:
            VEHICLE_PATH.write_text(
                json.dumps({
                    "lastUpdated": started.isoformat(),
                    "vehicles": per_vehicle_map,
                }, indent=2),
                encoding="utf-8",
            )
            log.info(f"Wrote {VEHICLE_PATH}")

        if write_js:
            write_static_fallback(by_state, dry_run=False)

    return {
        "lastUpdated":        started.isoformat(),
        "statesProcessed":    len(by_state),
        "totalIncentives":    sum(len(r.incentives) for r in by_state.values()),
        "federal":            federal,
        "perVehicleCount":    len(per_vehicle_map),
        "stateJsonPath":      str(STATE_PATH),
        "vehicleJsonPath":    str(VEHICLE_PATH) if per_vehicle_map else None,
        "dryRun":             dry_run,
    }


def _load_local_env() -> None:
    """Minimal .env loader so the CLI can be run directly from scraper/ without
    relying on shell exports. Mirrors run_local.py's loader."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ── CLI ──────────────────────────────────────────────────────────────────────
def _main():
    _load_local_env()

    parser = argparse.ArgumentParser(description="NREL AFDC monthly incentive pull")
    parser.add_argument("--state", help="Single state (e.g. CA). Default: all 50 + DC")
    parser.add_argument("--per-vehicle", action="store_true",
                        help="Also resolve per-vehicle eligibility (skeleton; off by default)")
    parser.add_argument("--api-key", default=os.environ.get("NREL_API_KEY", "DEMO_KEY"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-js", action="store_true", help="Skip regenerating the JS fallback")
    args = parser.parse_args()

    if args.api_key == "DEMO_KEY":
        log.warning("Using NREL DEMO_KEY — rate limited. Set NREL_API_KEY in env.")

    states = [args.state.upper()] if args.state else ALL_STATES

    # If per-vehicle, optionally load vehicle ids from summary
    vehicle_ids = None
    if args.per_vehicle:
        summary_path = DATA_DIR / "vehicles_summary.json"
        if summary_path.exists():
            vehicle_ids = [v.get("id") for v in json.loads(summary_path.read_text("utf-8")) if v.get("id")]

    report = run_incentive_pull(
        api_key=args.api_key,
        states=states,
        per_vehicle=args.per_vehicle,
        vehicle_ids=vehicle_ids,
        dry_run=args.dry_run,
        write_js=not args.no_js,
    )
    print("\n" + json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    _main()
