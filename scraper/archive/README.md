# Archived / deprecated scrapers

These modules powered the old per-brand + per-blog scraping pipeline. They are
**fragile** (Playwright/Selenium DOM parsing that breaks on every site redesign
or bot-detection change) and are **no longer part of the default pipeline**.

The reliable pipeline (`main.py`) now uses only:

- `scrapers/us_ev_catalog_scraper.py` — fueleconomy.gov (EPA/DOE) bulk CSV, the
  authoritative US EV spec source, trimmed to the most popular models per class.
- `scrapers/nhtsa_upcoming.py` — NHTSA vPIC pre-release "upcoming EV" radar.
- `incentives/nrel_incentives.py` — federal/state incentives.
- `processors/matcher_generator.py` — builds `frontend/public/data/matcher_vehicles.json`.

## Why these were retired

| File | Problem |
|------|---------|
| `tesla_scraper.py`, `hyundai_scraper.py`, `kia_scraper.py`, `ford_scraper.py`, `chevrolet_scraper.py`, `rivian_scraper.py`, `remaining_scrapers.py` | Per-brand Playwright scrapers; break on layout/bot-detection changes; slow; need a headful browser. |
| `selenium_base.py`, `selenium_scrapers.py` | Selenium fallbacks for the above — same fragility, heavier. |
| `ev_database_scraper.py` | Scrapes ev-database.org, a **European** catalog (EUR/GBP prices, WLTP ranges). Superseded by the US EPA catalog. |
| `insideevs_scraper.py`, `outofspec_scraper.py`, `recharged_scraper.py`, `findmyelectric_scraper.py`, `caranddriver_scraper.py`, `usnews_deals_scraper.py` | Blog/forum HTML scrapers for real-world range, used-market data, and deals. Useful enrichment but fragile and not required for the core catalog. Re-enable selectively once stabilized. |
| `base_scraper.py` | Playwright base class used only by the archived brand scrapers. |

## How to physically move them (the workspace shell was unavailable when this was
generated, so the files have NOT been moved automatically)

From the `scraper/` directory:

**PowerShell (Windows):**
```powershell
$files = @(
  "tesla_scraper.py","hyundai_scraper.py","kia_scraper.py","ford_scraper.py",
  "chevrolet_scraper.py","rivian_scraper.py","remaining_scrapers.py",
  "selenium_base.py","selenium_scrapers.py","ev_database_scraper.py",
  "base_scraper.py","insideevs_scraper.py","outofspec_scraper.py",
  "recharged_scraper.py","findmyelectric_scraper.py","caranddriver_scraper.py",
  "usnews_deals_scraper.py"
)
foreach ($f in $files) { git mv "scrapers/$f" "archive/$f" }
```

**bash / git:**
```bash
cd scraper
for f in tesla_scraper hyundai_scraper kia_scraper ford_scraper chevrolet_scraper \
         rivian_scraper remaining_scrapers selenium_base selenium_scrapers \
         ev_database_scraper base_scraper insideevs_scraper outofspec_scraper \
         recharged_scraper findmyelectric_scraper caranddriver_scraper usnews_deals_scraper; do
  git mv "scrapers/$f.py" "archive/$f.py"
done
```

`main.py` resolves these lazily as `archive.<module>` first, then `scrapers.<module>`,
so the legacy path keeps working both **before** and **after** you move the files.

## Running the legacy brand scrapers (not recommended)

```bash
python main.py --legacy-brands              # all archived brand scrapers
python main.py --legacy-brands --brand tesla
```

Requires Firebase credentials, Playwright (and optionally Selenium), and writes to
Firestore — none of which the default reliable pipeline needs.

## Edmunds reviews scraper (retired — Akamai-blocked)

`scrapers/edmunds_reviews_scraper.py` is **deprecated**. Edmunds sits behind
Akamai Bot Manager, which returns a JS challenge (403) that no plain HTTP client
(even curl_cffi Chrome impersonation) can pass, so the scraper can't fetch pages.
Scores/trims are now provided by:
  • `scrapers/greencarscompare_scraper.py` (GCC: overall / value / max storage)
    → writes `frontend/public/data/vehicle_scores.json`, and
  • `overrides/vehicle_overrides.yaml` (manual overrides, applied by
    `processors/apply_overrides.py`) — the authoritative source for trims/scores.

Move the Edmunds scraper here when convenient:

```bash
cd scraper
git mv scrapers/edmunds_reviews_scraper.py archive/edmunds_reviews_scraper.py
```

`frontend/public/data/edmunds_ratings.json` and `gcc_scores.json` are now unused
(the app reads `vehicle_scores.json`) and can be deleted.

## GreenCarsCompare scraper — ACTIVE (slimmed)

`scrapers/greencarscompare_scraper.py` is back in use, limited to three metrics
(overall score, value score, max cargo volume). It is NOT archived.

## Note on `specs_pipeline.py`

Left in `scrapers/` for now. If nothing imports it, move it here too.
