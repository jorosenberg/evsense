"""
config.py -- Central configuration for the EVsense scraper.

Reads from environment variables (set in GitHub Actions secrets or local .env).
All scraper modules import from here rather than reading env vars directly.
"""

import os
import json
import logging
from pathlib import Path

# Silence python-dotenv parse warnings globally.
# These fire when .env comment lines contain non-ASCII characters.
# We suppress them here and in any subprocess that imports this module.
import logging as _log
_log.getLogger("dotenv.main").setLevel(_log.CRITICAL)
_log.getLogger("dotenv").setLevel(_log.CRITICAL)


def _load_env_file():
    """
    Load .env manually -- handles multi-line JSON values that dotenv cannot parse.
    Your FIREBASE_SERVICE_ACCOUNT can span multiple lines in .env:
        FIREBASE_SERVICE_ACCOUNT={
          "type": "service_account",
          ...
        }
    """
    import os
    _env_path = Path(__file__).parent / '.env'
    if not _env_path.exists():
        return
    try:
        raw = _env_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return

    current_key = None
    value_parts = []
    brace_depth = 0

    for line in raw.splitlines():
        stripped = line.strip()

        if current_key:
            # Accumulating a multi-line value
            value_parts.append(stripped)
            brace_depth += stripped.count('{') - stripped.count('}')
            if brace_depth <= 0:
                full = ' '.join(value_parts).strip()
                os.environ.setdefault(current_key, full)
                current_key = None
                value_parts = []
                brace_depth = 0
        else:
            # Skip comments and blanks
            if not stripped or stripped.startswith('#'):
                continue
            if '=' not in stripped:
                continue
            eq = stripped.index('=')
            key = stripped[:eq].strip()
            val = stripped[eq + 1:].strip()
            if not key or key.startswith('#'):
                continue

            open_b = val.count('{')
            close_b = val.count('}')
            if open_b > 0 and open_b > close_b:
                # Start of a multi-line JSON value
                current_key = key
                value_parts = [val]
                brace_depth = open_b - close_b
            else:
                # Single-line: strip surrounding quotes if present
                if len(val) >= 2 and val[0] in ('"', "'") and val[-1] == val[0]                         and not val.startswith('{"'):
                    val = val[1:-1]
                os.environ.setdefault(key, val)

_load_env_file()


# --- Firebase -----------------------------------------------------------------

def get_firebase_service_account() -> dict:
    """
    Returns parsed Firebase service account JSON.

    In your scraper/.env file, the value must be on ONE line:
      FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

    dotenv sometimes returns the value with surrounding quotes still attached
    (e.g. '{"type":...}' with the single quotes included). We strip those.
    """
    raw = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '').strip()
    if not raw:
        raise EnvironmentError(
            'FIREBASE_SERVICE_ACCOUNT is not set.\n'
            'For local dev: add it to scraper/.env\n'
            'For GitHub Actions: add it to repository secrets'
        )

    # Strip ALL surrounding quote styles that dotenv might leave attached:
    #   '{"type":...}'  ->  {"type":...}
    #   "{"type":...}"  ->  {"type":...}   (less common)
    for _ in range(3):  # repeat in case of nested quoting
        raw = raw.strip()
        if (raw.startswith("'") and raw.endswith("'")):
            raw = raw[1:-1]
        elif (raw.startswith('"') and raw.endswith('"') and not raw.startswith('{"')):
            raw = raw[1:-1]

    # Validate it looks like JSON before attempting parse
    if not raw.startswith('{'):
        raise ValueError(
            f'FIREBASE_SERVICE_ACCOUNT does not look like JSON (starts with: {raw[:20]!r}).\n'
            'Make sure the value in your .env file is raw JSON:\n'
            '  FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"YOUR_ID",...}'
        )

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(
            f'FIREBASE_SERVICE_ACCOUNT is not valid JSON: {e}\n'
            'The value must be a single-line JSON object with no surrounding quotes.\n'
            f'Value starts with: {raw[:60]!r}'
        )


# --- API Keys -----------------------------------------------------------------

# Free at https://developer.nrel.gov/signup/ -- used for DOE AFDC API
NREL_API_KEY: str = os.environ.get('NREL_API_KEY', 'DEMO_KEY')

# DEMO_KEY is rate-limited to 30 req/hour and 50 req/day. Fine for testing,
# but get a real key before running the full scraper in production.
if NREL_API_KEY == 'DEMO_KEY':
    logging.warning(
        '[config] Using NREL DEMO_KEY -- rate limited to 30 req/hour. '
        'Get a free key at https://developer.nrel.gov/signup/'
    )


# --- Scraper behaviour --------------------------------------------------------

# Polite delay range between requests (seconds). Respect robots.txt spirit.
RATE_LIMIT_MIN_S: float = 1.5
RATE_LIMIT_MAX_S: float = 3.0

# How many times to retry a failed HTTP request before giving up
HTTP_RETRY_COUNT: int = 3

# Timeout for browser page loads (milliseconds)
BROWSER_TIMEOUT_MS: int = 30_000

# User-agent string for all requests (identifies us -- honest and transparent)
USER_AGENT: str = (
    'Mozilla/5.0 (compatible; EVsense-Scraper/1.0; '
    '+https://github.com/YOUR_USERNAME/evsense)'
)

# If True, no data is written to Firestore or disk. Controlled by --dry-run flag.
DRY_RUN: bool = False  # Set at runtime via CLI arg, not here


# --- Stale data policy --------------------------------------------------------

# Vehicles whose lastUpdated is older than this many days show a stale warning in the UI
STALE_WARNING_DAYS: int = 60

# If a scraper fails, we never overwrite the existing Firestore document with partial data.
# The existing document stays intact and serves stale-but-complete data.
NEVER_OVERWRITE_ON_PARTIAL_FAILURE: bool = True


# --- Paths -------------------------------------------------------------------

ROOT_DIR = Path(__file__).parent.parent
FRONTEND_DIR = ROOT_DIR / 'frontend'
VEHICLES_SUMMARY_PATH = FRONTEND_DIR / 'public' / 'data' / 'vehicles_summary.json'
REPORTS_DIR = Path(__file__).parent / 'reports'
REPORTS_DIR.mkdir(exist_ok=True)


# --- Firestore collections ----------------------------------------------------

COLLECTION_VEHICLES = 'vehicles'
COLLECTION_STATE_DATA = 'state_data'
COLLECTION_CHARGING_NETWORKS = 'charging_networks'


# --- DOE AFDC API ------------------------------------------------------------

AFDC_VEHICLES_API = 'https://developer.nrel.gov/api/transportation/v1/vehicles.json'
AFDC_STATIONS_API = 'https://developer.nrel.gov/api/alt-fuel-stations/v1.json'
AFDC_LAWS_API     = 'https://developer.nrel.gov/api/transportation/v1/legislations.json'

# NHTSA vPIC API (no key required)
NHTSA_VPIC_API = 'https://vpic.nhtsa.dot.gov/api/vehicles'

# EIA electricity rates (no key required for basic queries)
EIA_API = 'https://api.eia.gov/v2/electricity/retail-sales/data/'


# --- Logging -----------------------------------------------------------------

def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S',
    )