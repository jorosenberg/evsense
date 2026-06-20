"""
ev_database_scraper.py — Scrapes the full catalog from ev-database.org.

Outputs `frontend/public/data/ev_database.json` with every EV listed on the
homepage normalized to imperial units. Each entry includes:
  - id, name, make, model, year_from, year_to, status
  - body_shape, segment, seat_count, drivetrain
  - range_mi, efficiency_mi_per_kwh, battery_kwh, fast_charge_kw, weight_lbs,
    accel_0_60_s, top_speed_mph (when available)
  - towing_lbs, cargo_cu_ft
  - prices (raw EU prices in EUR/GBP) + msrp_usd_estimate (currency-converted)
  - sold_in_us (boolean), us_market_note
  - detail_url, image_url
  - last_updated

We deliberately do NOT hit individual detail pages — the homepage listing
already exposes enough specs for the cost calculator. Detail-page scraping
can be added later for trim-level pricing or charging curves.

Run from the repo root:
  python scraper/scrapers/ev_database_scraper.py
"""

from __future__ import annotations
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "ev_database.json"

CATALOG_URL = "https://ev-database.org/"
UA = "Mozilla/5.0 (EVsense scraper / true-cost catalog import; +https://github.com/jorosenberg)"

# ── Unit conversions ──────────────────────────────────────────────────────────
KM_TO_MI = 0.621371
KG_TO_LBS = 2.20462
L_TO_CU_FT = 0.0353147
# Loose exchange rates (snapshot 2026-Q1). The frontend treats `msrp_usd_estimate`
# as a starting estimate; the user can always override with a custom sell value.
EUR_TO_USD = 1.08
GBP_TO_USD = 1.27

# ── US market signal ──────────────────────────────────────────────────────────
# Makes that have any US-market presence (current or recent). We're permissive:
# even if a specific trim isn't sold here, we'll consider the brand US-available.
US_MARKET_MAKES = {
    "tesla", "ford", "chevrolet", "gmc", "cadillac", "lincoln", "rivian",
    "lucid", "lordstown", "fisker", "canoo", "vinfast",
    "hyundai", "kia", "genesis",
    "bmw", "mercedes-benz", "mercedes", "audi", "volkswagen", "porsche", "mini",
    "volvo", "polestar",
    "honda", "acura", "toyota", "lexus", "subaru", "mazda", "nissan", "infiniti",
    "jaguar", "land rover", "range rover",
    "scout",
    "afeela", "sony honda",
}

# Specific models known NOT to be sold in the US even if their maker is here.
# Conservative — leave blank to default to "available" when the make is US.
US_EXCLUDED_MODELS: set[tuple[str, str]] = set()


# ── Helpers ───────────────────────────────────────────────────────────────────
def _txt(el) -> str:
    return el.get_text(strip=True) if el else ""


def _num(s: str) -> float | None:
    """Extract first number from a string, ignoring commas, units, currency."""
    if not s:
        return None
    cleaned = s.replace(",", "").replace("\xa0", " ")
    m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    return float(m.group()) if m else None


def _spec_num(item, class_name: str) -> float | None:
    """Read a numeric value from a hidden span (precise) or its printable sibling."""
    hidden = item.find(class_=class_name)
    if hidden:
        v = _num(hidden.get_text())
        if v is not None:
            return v
    return None


def _print_text(item, class_name: str) -> str:
    el = item.find(class_=class_name)
    return _txt(el)


def _detect_drivetrain(item) -> str | None:
    icons = item.find("div", class_="icons-row-1")
    if not icons:
        return None
    html = str(icons)
    if "awd" in html.lower():
        return "AWD"
    if "voor" in html:  # Dutch: front
        return "FWD"
    if "achter" in html:  # Dutch: rear
        return "RWD"
    return None


def _detect_body_shape(item) -> str | None:
    for span in item.find_all("span", class_=re.compile(r"shape-")):
        cls = " ".join(span.get("class") or [])
        m = re.search(r"shape-([\w-]+)", cls)
        if m:
            return m.group(1).replace("-", " ").title()
    return None


def _detect_segment(item) -> str | None:
    seg = item.find("span", class_=re.compile(r"^size-[a-z]"))
    if seg:
        cls = " ".join(seg.get("class") or [])
        m = re.search(r"size-([a-z])", cls)
        if m:
            return m.group(1).upper()
    return None


def _detect_seats(item) -> int | None:
    seats_icon = item.find("i", class_=re.compile(r"seats-\d"))
    if seats_icon:
        cls = " ".join(seats_icon.get("class") or [])
        m = re.search(r"seats-(\d+)", cls)
        if m:
            return int(m.group(1))
    # Fallback: look for "5" or similar after the seats icon
    return None


def _detect_plug(item) -> str | None:
    for span in item.find_all("span", class_=re.compile(r"plug-")):
        cls = " ".join(span.get("class") or [])
        m = re.search(r"plug-([\w-]+)", cls)
        if m:
            plug = m.group(1)
            mapping = {
                "type2-ccs": "CCS Combo 2",
                "type2-tesla": "Tesla NACS (EU)",
                "type1-ccs": "CCS Combo 1",
                "type1-jt": "J1772",
                "type2": "Type 2",
                "type1": "J1772",
            }
            return mapping.get(plug, plug.replace("-", " ").upper())
    return None


def _detect_availability(item) -> tuple[str, str]:
    """Return (status, raw_text). Status is one of: current, upcoming, archive."""
    avail = item.find("div", class_=re.compile(r"availability"))
    raw = _txt(avail)
    classes = " ".join(avail.get("class", [])) if avail else ""
    if "archive" in classes or "discontinued" in raw.lower():
        return "archive", raw
    if "upcoming" in classes or "expected" in raw.lower():
        return "upcoming", raw
    return "current", raw


def _extract_prices(item) -> dict:
    prices = {}
    for div in item.find_all("div", class_="price_buy"):
        for span in div.find_all("span"):
            cls = " ".join(span.get("class") or [])
            m = re.search(r"country_(\w+)", cls)
            if not m:
                continue
            country = m.group(1).upper()
            raw = span.get_text(strip=True)
            amount = _num(raw)
            currency = (
                "GBP" if "£" in raw
                else "EUR" if "€" in raw
                else "USD" if "$" in raw
                else None
            )
            if amount and currency:
                prices[country] = {"currency": currency, "amount": amount, "raw": raw}
    return prices


def _msrp_usd_estimate(prices: dict, hidden_eur: float | None) -> float | None:
    """Pick the cheapest EU listing and convert to USD."""
    # Prefer the German price if present (often the largest EV market in EU).
    for country in ("DE", "NL", "FR", "UK", "ES", "IT"):
        if country in prices:
            p = prices[country]
            rate = EUR_TO_USD if p["currency"] == "EUR" else GBP_TO_USD if p["currency"] == "GBP" else 1.0
            return round(p["amount"] * rate)
    if hidden_eur:
        return round(hidden_eur * EUR_TO_USD)
    return None


def _make_id(href: str) -> str:
    """Stable id from the detail-page slug."""
    m = re.search(r"/car/(\d+)/([\w-]+)", href or "")
    if m:
        return f"evdb-{m.group(1)}-{m.group(2).lower()}"
    return ""


def parse_item(item) -> dict | None:
    title_a = item.find("a", class_="title")
    if not title_a:
        return None

    href = title_a.get("href", "")
    if not href:
        return None
    detail_url = f"https://ev-database.org{href}"

    # Make + model live in two spans inside the title.
    spans = title_a.find_all("span", recursive=False)
    if len(spans) < 2:
        return None
    make = _txt(spans[0])
    model_span = spans[1]
    # Drop the inline year-style suffix span if present
    for inner in model_span.find_all("span"):
        inner.decompose()
    model = model_span.get_text(strip=True)

    status, status_raw = _detect_availability(item)

    # Year range. ev-database.org uses year_to=2000 as a sentinel for
    # "still in production" / "unknown end year". Normalize it.
    year_from = _spec_num(item, "year_from")
    year_to_raw = _spec_num(item, "year_to")
    year_to: float | None = year_to_raw
    if year_to_raw and year_to_raw <= 2000:
        year_to = None  # still produced or unknown

    # Specs (hidden numeric where present, fallback to printable)
    range_km = _spec_num(item, "erange_real") or _num(_print_text(item, "erange_real"))
    efficiency_wh_km = _num(_print_text(item, "efficiency"))
    weight_kg = _spec_num(item, "weight")
    accel_0_100_s = _spec_num(item, "acceleration")
    long_distance_km = _spec_num(item, "long_distance_total_sort") or _num(_print_text(item, "long_distance_total"))
    battery_kwh = _spec_num(item, "battery") or _num(_print_text(item, "battery_p"))
    fast_charge_kw = _spec_num(item, "fastcharge_speed") or _num(_print_text(item, "fastcharge_speed_print"))
    towing_kg = _spec_num(item, "towweight") or _num(_print_text(item, "towweight_p"))
    cargo_l = _spec_num(item, "cargosort") or _num(_print_text(item, "cargo"))

    price_filter = _spec_num(item, "pricefilter")
    prices = _extract_prices(item)
    msrp_usd_estimate = _msrp_usd_estimate(prices, price_filter)

    img_tag = item.find("img")
    image_url = ""
    if img_tag:
        src = img_tag.get("src") or ""
        if src.startswith("/"):
            image_url = f"https://ev-database.org{src}"
        else:
            image_url = src

    # ── Imperial conversions ───────────────────────────────────────────────
    range_mi = round(range_km * KM_TO_MI) if range_km else None
    long_distance_mi = round(long_distance_km * KM_TO_MI) if long_distance_km else None
    weight_lbs = round(weight_kg * KG_TO_LBS) if weight_kg else None
    towing_lbs = round(towing_kg * KG_TO_LBS) if towing_kg else None
    cargo_cu_ft = round(cargo_l * L_TO_CU_FT, 1) if cargo_l else None
    # Wh/km → mi/kWh:  1000 Wh per kWh / (Wh per km * km per mi)
    efficiency_mi_per_kwh = round(1000 / efficiency_wh_km * KM_TO_MI, 2) if efficiency_wh_km else None
    # 0-100 km/h ≈ 0-62 mph. The Wikipedia EU→US convention applies a small
    # correction of ~0.2s; we approximate 0-60 mph as 0.95 * 0-100 km/h.
    accel_0_60_s = round(accel_0_100_s * 0.95, 1) if accel_0_100_s else None

    make_norm = make.lower().strip()
    sold_in_us = make_norm in US_MARKET_MAKES and (make_norm, model.lower()) not in US_EXCLUDED_MODELS

    # Treat any discontinued ("archive") vehicle as a used-market candidate,
    # plus any vehicle whose year_from is more than 3 years older than today.
    current_year = datetime.now(timezone.utc).year
    used_treatment = (
        status == "archive"
        or (year_from is not None and (current_year - year_from) >= 3)
    )

    us_market_note = None
    if not sold_in_us:
        us_market_note = (
            f"{make} is not sold in the United States. Pricing and specs are sourced from European market "
            "data; the cost calculator assumes a hypothetical US purchase using a currency-converted MSRP. "
            "Provide your own purchase price for a more accurate estimate."
        )

    return {
        "id": _make_id(href),
        "name": f"{make} {model}".strip(),
        "make": make,
        "model": model,
        "year_from": int(year_from) if year_from else None,
        "year_to": int(year_to) if year_to else None,
        "status": status,                       # current | upcoming | archive
        "availability_text": status_raw,
        "body_shape": _detect_body_shape(item),
        "segment": _detect_segment(item),       # EU market segment letter
        "seat_count": _detect_seats(item),
        "drivetrain": _detect_drivetrain(item),
        "plug_type": _detect_plug(item),

        "range_mi": range_mi,
        "long_distance_range_mi": long_distance_mi,   # 1-stop highway range
        "efficiency_mi_per_kwh": efficiency_mi_per_kwh,
        "battery_kwh": battery_kwh,
        "fast_charge_kw": fast_charge_kw,
        "accel_0_60_s": accel_0_60_s,
        "weight_lbs": weight_lbs,
        "towing_lbs": towing_lbs,
        "cargo_cu_ft": cargo_cu_ft,

        "prices": prices,
        "msrp_usd_estimate": msrp_usd_estimate,
        "currency_assumed": "EUR_to_USD" if msrp_usd_estimate else None,

        "sold_in_us": sold_in_us,
        "us_market_note": us_market_note,
        "used_treatment": used_treatment,

        "detail_url": detail_url,
        "image_url": image_url,
        "image_credit": "ev-database.org",
    }


def fetch_catalog_html(url: str = CATALOG_URL, retries: int = 3) -> str:
    headers = {"User-Agent": UA, "Accept": "text/html"}
    last_exc = None
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=30, follow_redirects=True, headers=headers) as client:
                r = client.get(url)
                r.raise_for_status()
                return r.text
        except Exception as e:
            last_exc = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_exc}")


def scrape(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.find_all("div", class_="list-item")
    out: list[dict] = []
    for item in items:
        try:
            row = parse_item(item)
            if row and row.get("id"):
                out.append(row)
        except Exception as e:
            print(f"  skip item: {e}", file=sys.stderr)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape ev-database.org catalog.")
    ap.add_argument("--out", default=str(OUT_PATH), help="Output JSON path")
    ap.add_argument("--cached-html", help="Optional path to a saved HTML file (skip network)")
    ap.add_argument("--limit", type=int, default=0, help="Limit entries (debug)")
    args = ap.parse_args()

    if args.cached_html:
        html = Path(args.cached_html).read_text(encoding="utf-8")
        print(f"Loaded cached HTML ({len(html):,} bytes)")
    else:
        print(f"Fetching {CATALOG_URL}...")
        html = fetch_catalog_html()
        print(f"  ok ({len(html):,} bytes)")

    print("Parsing...")
    rows = scrape(html)
    if args.limit:
        rows = rows[: args.limit]
    print(f"  parsed {len(rows)} vehicles")

    # Sort: US-available first, then by make, model
    rows.sort(key=lambda r: (not r["sold_in_us"], r.get("status") != "current",
                             (r.get("make") or "").lower(), (r.get("model") or "").lower()))

    out = {
        "source": "ev-database.org",
        "source_url": CATALOG_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "exchange_rates_used": {"EUR_USD": EUR_TO_USD, "GBP_USD": GBP_TO_USD},
        "count": len(rows),
        "us_count": sum(1 for r in rows if r["sold_in_us"]),
        "vehicles": rows,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"  total={out['count']}, US-market={out['us_count']}")


if __name__ == "__main__":
    main()
