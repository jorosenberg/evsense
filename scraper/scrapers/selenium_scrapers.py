"""
selenium_scrapers.py -- Selenium backup scrapers for all manufacturers.

Called when Playwright returns 0 vehicles. Three-layer strategy per brand:
  1. Extract from embedded JS state (__NEXT_DATA__, window.__STATE__, etc.)
  2. Regex price patterns on rendered page source
  3. Curated MSRP fallback -- always returns something (Q1 2025 prices)

Updated from Ervinoreo/Tesla_Scrape (github.com/Ervinoreo/Tesla_Scrape):
  - No hardcoded chromedriver path (uses webdriver-manager)
  - Returns structured Firestore document shape instead of CSV rows
  - Curated fallback ensures data is never empty
"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

from selenium.webdriver.common.by import By
from scrapers.selenium_base import SeleniumScraper


# ---------------------------------------------------------------------------
# Curated MSRP fallbacks (Q1 2025 -- update after manufacturer price changes)
# ---------------------------------------------------------------------------
CURATED_MSRP = {
    "tesla": {
        "Model 3":    [("RWD", 38990), ("Long Range AWD", 45990), ("Performance", 50990)],
        "Model Y":    [("RWD", 43990), ("Long Range AWD", 50990), ("Performance", 53990)],
        "Model S":    [("Base", 74990), ("Plaid", 89990)],
        "Model X":    [("Base", 79990), ("Plaid", 99990)],
        "Cybertruck": [("AWD", 69890), ("Cyberbeast", 99890)],
    },
    "hyundai": {
        "IONIQ 5": [("SE Standard RWD", 41450), ("SE Long Range AWD", 51450)],
        "IONIQ 6": [("SE Standard RWD", 38615), ("SE Long Range AWD", 48615)],
        "IONIQ 9": [("SE Long Range AWD", 68490)],
    },
    "kia": {
        "EV6": [("Light RWD", 42600), ("Wind AWD", 49600), ("GT AWD", 61600)],
        "EV9": [("Light RWD", 54900), ("Wind AWD", 60900), ("GT-Line AWD", 67900)],
    },
    "ford": {
        "Mustang Mach-E": [("Select RWD", 42995), ("Premium AWD", 51995), ("GT AWD", 59995)],
        "F-150 Lightning": [("Pro", 49995), ("XLT", 54995), ("Lariat", 69995), ("Platinum", 91995)],
        "E-Transit": [("Cargo Van", 51995)],
    },
    "chevrolet": {
        "Equinox EV":   [("LS FWD", 34995), ("1LT FWD", 36995), ("2RS AWD", 41995)],
        "Blazer EV":    [("LT FWD", 42995), ("2LT FWD", 46995), ("RS AWD", 56995)],
        "Silverado EV": [("Work Truck", 41995), ("LT", 57995), ("RST", 74995)],
    },
    "rivian": {
        "R1T": [("Dual-Motor Standard", 69900), ("Dual-Motor Max", 79900), ("Quad-Motor Max", 99900)],
        "R1S": [("Dual-Motor Standard", 75900), ("Dual-Motor Max", 85900), ("Quad-Motor Max", 105900)],
        "R2":  [("Base", 45000)],
    },
    "bmw": {
        "i4":  [("eDrive35", 52200), ("xDrive40", 57900), ("M50", 67900)],
        "iX":  [("xDrive40", 87100), ("xDrive50", 98900), ("M60", 108900)],
        "i5":  [("eDrive40", 67900), ("M60 xDrive", 84900)],
        "i7":  [("xDrive60", 111300), ("M70 xDrive", 185000)],
    },
    "volkswagen": {
        "ID.4":     [("Standard RWD", 38995), ("Pro S RWD", 43995), ("Pro S AWD", 46995)],
        "ID. Buzz": [("Standard", 59995), ("Long Wheelbase", 64995)],
    },
    "lucid": {
        "Air":     [("Pure", 69900), ("Touring", 107900), ("Grand Touring", 138000)],
        "Gravity": [("Grand Touring", 94900)],
    },
    "polestar": {
        "Polestar 2": [("Standard RWD", 44900), ("Long Range RWD", 48900), ("Long Range AWD", 54900)],
        "Polestar 3": [("Long Range AWD", 73400), ("Long Range Performance AWD", 82400)],
        "Polestar 4": [("Standard RWD", 56900), ("Long Range RWD", 61900), ("Long Range AWD", 64900)],
    },
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _build_doc(brand: str, info: dict, trims: list, year: int,
               scraper_method: str = "selenium_fallback") -> dict:
    """Build a Firestore-shaped vehicle document from extracted trims."""
    base_msrp = min(t["msrp"] for t in trims) if trims else None
    slug = info["slug"]
    return {
        "id": f"{brand}-{slug}-{year}",
        "make": info.get("make", brand.title()),
        "model": info["model"],
        "year": year,
        "type": "new",
        "category": info["body_style"],
        "bodyStyle": info["body_style"],
        "manufacturerUrl": info.get("url", ""),
        "msrpFrom": base_msrp,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "comingSoon": False,
        "scraperMethod": scraper_method,
        "trims": [
            {"name": t["name"], "msrp": t["msrp"],
             "financeOffers": [], "leaseOffers": [], "availableColors": []}
            for t in trims
        ],
    }


def _extract_prices_from_source(source: str, min_price: int, max_price: int) -> list[dict]:
    """Extract price points from raw HTML source using regex patterns."""
    trims = []
    seen: set[int] = set()

    for pattern in [
        r'"(?:price|msrp|basePrice|baseMsrp|startingMsrp|totalMsrp)"\s*:\s*(\d{4,6})',
        r'\$(\d{2,3}),(\d{3})(?!\d)',
    ]:
        for match in re.findall(pattern, source):
            price = int("".join(match)) if isinstance(match, tuple) else int(match)
            if min_price <= price <= max_price and price not in seen:
                seen.add(price)
                trims.append({"name": f"Trim {len(trims)+1}", "msrp": price})

    return trims[:4]


def _curated_fallback(brand: str, info: dict, year: int) -> Optional[dict]:
    """Return a doc built from curated data, or None if brand/model not in table."""
    entries = CURATED_MSRP.get(brand, {}).get(info["model"], [])
    if not entries:
        return None
    trims = [{"name": name, "msrp": price} for name, price in entries]
    return _build_doc(brand, info, trims, year, scraper_method="curated_fallback")


def _scrape_generic(scraper: "SeleniumScraper", brand: str, info: dict,
                    min_price: int = 25000, max_price: int = 200000) -> Optional[dict]:
    """
    Generic scrape flow used by all brand scrapers:
    1. Load page, extract from JS state
    2. Regex on page source
    3. Curated fallback
    """
    year = info.get("year", 2025)
    driver = scraper.get_driver()
    driver.get(info["url"])
    scraper.wait_for_page(3.0)

    trims: list[dict] = []

    # Layer 1: JS state objects
    for js_var in ["window.__NEXT_DATA__", "window.__INITIAL_STATE__",
                   "window.__PRELOADED_STATE__", "window.__REDUX_STATE__",
                   "window.GMGlobal", "window.__NUXT__", "window.__APP_STATE__"]:
        data = scraper.get_json_from_page(js_var)
        if data:
            source = json.dumps(data)
            trims = _extract_prices_from_source(source, min_price, max_price)
            if trims:
                scraper.log(f"  {info['model']}: {len(trims)} trim(s) via {js_var}")
                break

    # Layer 2: Raw page source
    if not trims:
        source = driver.page_source
        trims = _extract_prices_from_source(source, min_price, max_price)
        if trims:
            scraper.log(f"  {info['model']}: {len(trims)} trim(s) via page source regex")

    # Layer 3: Curated fallback
    if not trims:
        doc = _curated_fallback(brand, info, year)
        if doc:
            scraper.log(f"  {info['model']}: using curated MSRP fallback")
            return doc
        scraper.log(f"  {info['model']}: no data found anywhere")
        return None

    return _build_doc(brand, info, trims, year)


# ---------------------------------------------------------------------------
# Tesla
# ---------------------------------------------------------------------------

class TeslaSeleniumScraper(SeleniumScraper):
    """
    Updated from Ervinoreo/Tesla_Scrape.
    Scrapes:
      - Pricing from tesla.com/{model}/design pages (__NEXT_DATA__ extraction)
      - Current offers from tesla.com/current-offers
    """
    BRAND = "tesla"
    VEHICLES = [
        {"make": "Tesla", "model": "Model 3",    "slug": "model3",     "year": 2025, "body_style": "sedan", "url": "https://www.tesla.com/model3/design"},
        {"make": "Tesla", "model": "Model Y",    "slug": "modely",     "year": 2025, "body_style": "suv",   "url": "https://www.tesla.com/modely/design"},
        {"make": "Tesla", "model": "Model S",    "slug": "models",     "year": 2025, "body_style": "sedan", "url": "https://www.tesla.com/models/design"},
        {"make": "Tesla", "model": "Model X",    "slug": "modelx",     "year": 2025, "body_style": "suv",   "url": "https://www.tesla.com/modelx/design"},
        {"make": "Tesla", "model": "Cybertruck", "slug": "cybertruck", "year": 2025, "body_style": "truck", "url": "https://www.tesla.com/cybertruck/design"},
    ]

    # Maps model name keywords -> vehicle slug for offer attribution
    _MODEL_SLUG_MAP = {
        "model 3":    "model3",
        "model y":    "modely",
        "model s":    "models",
        "model x":    "modelx",
        "cybertruck": "cybertruck",
    }

    def scrape(self) -> list[dict]:
        # Step 1: Scrape current offers first (single page covers all models)
        offers_by_slug = self._scrape_offers()

        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "tesla", info, 35000, 120000)
                if doc:
                    # Attach any offers found for this vehicle
                    slug = info["slug"]
                    if slug in offers_by_slug:
                        doc["currentDeals"] = offers_by_slug[slug]
                        self.log(f"  {info['model']}: attached {len(offers_by_slug[slug].get('cashBack', []) + offers_by_slug[slug].get('financeDeals', []) + offers_by_slug[slug].get('leaseDeals', []))} offer(s)")
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR on {info['model']}: {e}")
                fallback = _curated_fallback("tesla", info, info["year"])
                if fallback:
                    if info["slug"] in offers_by_slug:
                        fallback["currentDeals"] = offers_by_slug[info["slug"]]
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results

    def _scrape_offers(self) -> dict[str, dict]:
        """
        Scrape tesla.com/current-offers using Selenium.
        Returns dict keyed by vehicle slug -> currentDeals dict.
        undetected-chromedriver bypasses Tesla's bot detection better than Playwright.
        """
        offers_by_slug: dict[str, dict] = {}
        self.log("Fetching Tesla current offers...")

        driver = self.get_driver()
        try:
            driver.get("https://www.tesla.com/current-offers")
            # Wait for React to render offer tiles
            import time
            time.sleep(4)

            page_text = driver.execute_script("return document.body.innerText") or ""

            if len(page_text) < 200:
                self.log("  Offers page returned minimal content")
                return {}

            self.log(f"  Offers page: {len(page_text)} chars")

            # Parse deals from rendered text
            cash_back_by_slug:   dict[str, list] = {}
            finance_by_slug:     dict[str, list] = {}
            lease_by_slug:       dict[str, list] = {}

            paragraphs = page_text.split('\n')
            for para in paragraphs:
                if len(para.strip()) < 15:
                    continue
                para_lower = para.lower()

                # Identify which model this line refers to
                slug = None
                for keyword, model_slug in self._MODEL_SLUG_MAP.items():
                    if keyword in para_lower:
                        slug = model_slug
                        break
                if not slug:
                    continue

                # Cash discount / savings
                for m in re.finditer(
                    r'\$([\d,]+)\s*(?:discount|savings?|off|cash[\s-]?back|customer[\s-]?cash|bonus)',
                    para, re.IGNORECASE
                ):
                    amount = int(m.group(1).replace(',', ''))
                    if 100 <= amount <= 15000:
                        cash_back_by_slug.setdefault(slug, []).append({
                            "amount": amount,
                            "description": re.sub(r'\s+', ' ', para).strip()[:200],
                            "expiresAt": self._extract_expiry(para),
                        })

                # APR finance deals
                for m in re.finditer(
                    r'(\d+\.?\d*)\s*%\s*(?:APR|financing|interest)[^\n]{0,40}?(\d+)\s*month',
                    para, re.IGNORECASE
                ):
                    apr = float(m.group(1))
                    term = int(m.group(2))
                    if apr <= 15 and 12 <= term <= 84:
                        finance_by_slug.setdefault(slug, []).append({
                            "apr": apr,
                            "termMonths": term,
                            "description": re.sub(r'\s+', ' ', para).strip()[:200],
                            "expiresAt": self._extract_expiry(para),
                        })

                # Lease deals
                for m in re.finditer(
                    r'\$([\d,]+)\s*(?:/mo|per month)[^\n]{0,60}?(\d+)\s*month',
                    para, re.IGNORECASE
                ):
                    payment = int(m.group(1).replace(',', ''))
                    term = int(m.group(2))
                    if 100 <= payment <= 2000 and 24 <= term <= 60:
                        das_m = re.search(r'\$([\d,]+)\s*due at signing', para, re.IGNORECASE)
                        das = int(das_m.group(1).replace(',', '')) if das_m else None
                        lease_by_slug.setdefault(slug, []).append({
                            "monthlyPayment": payment,
                            "termMonths": term,
                            "dueAtSigning": das,
                            "description": re.sub(r'\s+', ' ', para).strip()[:200],
                            "expiresAt": self._extract_expiry(para),
                        })

            # Combine into per-vehicle deal dicts
            all_slugs = set(cash_back_by_slug) | set(finance_by_slug) | set(lease_by_slug)
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            for slug in all_slugs:
                offers_by_slug[slug] = {
                    "cashBack":     cash_back_by_slug.get(slug, []),
                    "financeDeals": finance_by_slug.get(slug, []),
                    "leaseDeals":   lease_by_slug.get(slug, []),
                    "lastScraped":  now,
                    "sourceUrl":    "https://www.tesla.com/current-offers",
                }

            total = sum(
                len(d.get("cashBack", [])) + len(d.get("financeDeals", [])) + len(d.get("leaseDeals", []))
                for d in offers_by_slug.values()
            )
            self.log(f"  Found {total} offer(s) across {len(offers_by_slug)} model(s)")

        except Exception as e:
            self.log(f"  Offers scrape error: {e}")

        return offers_by_slug

    @staticmethod
    def _extract_expiry(text: str):
        """Extract expiry date string from offer text."""
        for pattern in [
            r'[Ee]xpires?\s+(\d{1,2}/\d{1,2}/\d{2,4})',
            r'[Tt]hrough\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}',
            r'(\d{1,2}/\d{1,2}/\d{2,4})',
        ]:
            m = re.search(pattern, text)
            if m:
                return m.group(0)
        return None


# ---------------------------------------------------------------------------
# Hyundai
# ---------------------------------------------------------------------------

class HyundaiSeleniumScraper(SeleniumScraper):
    BRAND = "hyundai"
    VEHICLES = [
        {"make": "Hyundai", "model": "IONIQ 5", "slug": "ioniq-5", "year": 2025, "body_style": "suv",   "url": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-5/build"},
        {"make": "Hyundai", "model": "IONIQ 6", "slug": "ioniq-6", "year": 2025, "body_style": "sedan", "url": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-6/build"},
        {"make": "Hyundai", "model": "IONIQ 9", "slug": "ioniq-9", "year": 2025, "body_style": "suv",   "url": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-9/build"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "hyundai", info, 35000, 80000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("hyundai", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit()
        self.close()
        return results


# ---------------------------------------------------------------------------
# Kia
# ---------------------------------------------------------------------------

class KiaSeleniumScraper(SeleniumScraper):
    BRAND = "kia"
    VEHICLES = [
        {"make": "Kia", "model": "EV6", "slug": "ev6", "year": 2025, "body_style": "suv", "url": "https://www.kia.com/us/en/ev6/build"},
        {"make": "Kia", "model": "EV9", "slug": "ev9", "year": 2025, "body_style": "suv", "url": "https://www.kia.com/us/en/ev9/build"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "kia", info, 35000, 80000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("kia", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit()
        self.close()
        return results


# ---------------------------------------------------------------------------
# Ford
# ---------------------------------------------------------------------------

class FordSeleniumScraper(SeleniumScraper):
    BRAND = "ford"
    VEHICLES = [
        {"make": "Ford", "model": "Mustang Mach-E", "slug": "mustang-mach-e", "year": 2025, "body_style": "suv",   "url": "https://www.ford.com/suvs/mach-e/"},
        {"make": "Ford", "model": "F-150 Lightning","slug": "f-150-lightning", "year": 2025, "body_style": "truck", "url": "https://www.ford.com/trucks/f150/f-150-lightning/"},
        {"make": "Ford", "model": "E-Transit",      "slug": "e-transit",       "year": 2025, "body_style": "van",   "url": "https://www.ford.com/commercial-trucks/e-transit/"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "ford", info, 30000, 130000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("ford", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Chevrolet
# ---------------------------------------------------------------------------

class ChevroletSeleniumScraper(SeleniumScraper):
    BRAND = "chevrolet"
    VEHICLES = [
        {"make": "Chevrolet", "model": "Equinox EV",   "slug": "equinox-ev",   "year": 2025, "body_style": "suv",   "url": "https://www.chevrolet.com/electric/equinox-ev"},
        {"make": "Chevrolet", "model": "Blazer EV",    "slug": "blazer-ev",    "year": 2025, "body_style": "suv",   "url": "https://www.chevrolet.com/electric/blazer-ev"},
        {"make": "Chevrolet", "model": "Silverado EV", "slug": "silverado-ev", "year": 2025, "body_style": "truck", "url": "https://www.chevrolet.com/electric/silverado-ev"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "chevrolet", info, 25000, 120000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("chevrolet", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Rivian
# ---------------------------------------------------------------------------

class RivianSeleniumScraper(SeleniumScraper):
    BRAND = "rivian"
    VEHICLES = [
        {"make": "Rivian", "model": "R1T", "slug": "r1t", "year": 2025, "body_style": "truck", "url": "https://rivian.com/r1t"},
        {"make": "Rivian", "model": "R1S", "slug": "r1s", "year": 2025, "body_style": "suv",   "url": "https://rivian.com/r1s"},
        {"make": "Rivian", "model": "R2",  "slug": "r2",  "year": 2025, "body_style": "suv",   "url": "https://rivian.com/r2"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "rivian", info, 40000, 130000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("rivian", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# BMW
# ---------------------------------------------------------------------------

class BMWSeleniumScraper(SeleniumScraper):
    BRAND = "bmw"
    VEHICLES = [
        {"make": "BMW", "model": "i4",  "slug": "i4",  "year": 2025, "body_style": "sedan", "url": "https://www.bmwusa.com/vehicles/i4/sedan/build-your-own.html"},
        {"make": "BMW", "model": "iX",  "slug": "ix",  "year": 2025, "body_style": "suv",   "url": "https://www.bmwusa.com/vehicles/ix/sports-activity-vehicle/build-your-own.html"},
        {"make": "BMW", "model": "i5",  "slug": "i5",  "year": 2025, "body_style": "sedan", "url": "https://www.bmwusa.com/vehicles/i5/sedan/build-your-own.html"},
        {"make": "BMW", "model": "i7",  "slug": "i7",  "year": 2025, "body_style": "sedan", "url": "https://www.bmwusa.com/vehicles/i7/sedan/build-your-own.html"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "bmw", info, 40000, 200000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("bmw", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Volkswagen
# ---------------------------------------------------------------------------

class VolkswagenSeleniumScraper(SeleniumScraper):
    BRAND = "volkswagen"
    VEHICLES = [
        {"make": "Volkswagen", "model": "ID.4",    "slug": "id4",     "year": 2025, "body_style": "suv", "url": "https://www.vw.com/en/models/id4/builder.html"},
        {"make": "Volkswagen", "model": "ID. Buzz", "slug": "id-buzz", "year": 2025, "body_style": "van", "url": "https://www.vw.com/en/models/id-buzz/builder.html"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "volkswagen", info, 35000, 80000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("volkswagen", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Lucid
# ---------------------------------------------------------------------------

class LucidSeleniumScraper(SeleniumScraper):
    BRAND = "lucid"
    VEHICLES = [
        {"make": "Lucid", "model": "Air",     "slug": "air",     "year": 2025, "body_style": "sedan", "url": "https://lucidmotors.com/air/configure"},
        {"make": "Lucid", "model": "Gravity", "slug": "gravity", "year": 2025, "body_style": "suv",   "url": "https://lucidmotors.com/gravity/configure"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "lucid", info, 60000, 250000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("lucid", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Polestar
# ---------------------------------------------------------------------------

class PolestarSeleniumScraper(SeleniumScraper):
    BRAND = "polestar"
    VEHICLES = [
        {"make": "Polestar", "model": "Polestar 2", "slug": "polestar-2", "year": 2025, "body_style": "sedan", "url": "https://www.polestar.com/us/polestar-2/"},
        {"make": "Polestar", "model": "Polestar 3", "slug": "polestar-3", "year": 2025, "body_style": "suv",   "url": "https://www.polestar.com/us/polestar-3/"},
        {"make": "Polestar", "model": "Polestar 4", "slug": "polestar-4", "year": 2025, "body_style": "suv",   "url": "https://www.polestar.com/us/polestar-4/"},
    ]

    def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = _scrape_generic(self, "polestar", info, 40000, 120000)
                if doc:
                    results.append(doc)
            except Exception as e:
                self.log(f"ERROR: {e}")
                fallback = _curated_fallback("polestar", info, info["year"])
                if fallback:
                    results.append(fallback)
            self.rate_limit(2.0, 4.0)
        self.close()
        return results


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

SELENIUM_SCRAPERS = {
    "tesla":       TeslaSeleniumScraper,
    "hyundai":     HyundaiSeleniumScraper,
    "kia":         KiaSeleniumScraper,
    "ford":        FordSeleniumScraper,
    "chevrolet":   ChevroletSeleniumScraper,
    "rivian":      RivianSeleniumScraper,
    "bmw":         BMWSeleniumScraper,
    "volkswagen":  VolkswagenSeleniumScraper,
    "lucid":       LucidSeleniumScraper,
    "polestar":    PolestarSeleniumScraper,
}