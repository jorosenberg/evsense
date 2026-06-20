"""
tesla_scraper.py - Scrapes Tesla EV pricing and specs.

Priority:
  1. Car and Driver specs (via specs_pipeline)
  2. Tesla.com __NEXT_DATA__ (Playwright)
  3. Curated static data
"""
import json
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "Model 3":    {"trims": [("RWD",38990),("Long Range AWD",45990),("Performance",50990)],    "specs": {"range":272,"batteryKwh":57.5,"chargingSpeedDcFastKw":170,"chargingSpeedL2Kw":11.5,"milesPerKwh":4.7,"horsepower":208,"torqueLbFt":260,"zeroToSixty":5.8,"topSpeed":125,"seatingCapacity":5,"cargoVolumeCuFt":23,"frunkVolumeCuFt":2.8,"towingCapacityLbs":0,"groundClearanceIn":5.5,"weightLbs":4048,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    "Model Y":    {"trims": [("RWD",43990),("Long Range AWD",50990),("Performance",53990)],    "specs": {"range":310,"batteryKwh":75.0,"chargingSpeedDcFastKw":250,"chargingSpeedL2Kw":11.5,"milesPerKwh":4.1,"horsepower":283,"torqueLbFt":340,"zeroToSixty":5.0,"topSpeed":135,"seatingCapacity":5,"cargoVolumeCuFt":76,"frunkVolumeCuFt":4.1,"towingCapacityLbs":3500,"groundClearanceIn":6.6,"weightLbs":4416,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":120000}},
    "Model S":    {"trims": [("Base",74990),("Plaid",89990)],                                   "specs": {"range":405,"batteryKwh":100.0,"chargingSpeedDcFastKw":250,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.9,"horsepower":670,"torqueLbFt":487,"zeroToSixty":3.1,"topSpeed":155,"seatingCapacity":5,"cargoVolumeCuFt":28,"frunkVolumeCuFt":2.1,"towingCapacityLbs":0,"groundClearanceIn":4.6,"weightLbs":4561,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":150000}},
    "Model X":    {"trims": [("Base",79990),("Plaid",99990)],                                   "specs": {"range":335,"batteryKwh":100.0,"chargingSpeedDcFastKw":250,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.2,"horsepower":670,"torqueLbFt":487,"zeroToSixty":3.8,"topSpeed":155,"seatingCapacity":5,"cargoVolumeCuFt":88,"frunkVolumeCuFt":2.4,"towingCapacityLbs":5000,"groundClearanceIn":6.3,"weightLbs":5185,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":150000}},
    "Cybertruck": {"trims": [("AWD",69890),("Cyberbeast",99890)],                              "specs": {"range":340,"batteryKwh":123.0,"chargingSpeedDcFastKw":350,"chargingSpeedL2Kw":11.5,"milesPerKwh":2.5,"horsepower":600,"torqueLbFt":779,"zeroToSixty":4.1,"topSpeed":112,"seatingCapacity":5,"cargoVolumeCuFt":58,"frunkVolumeCuFt":0,"towingCapacityLbs":11000,"groundClearanceIn":16.0,"weightLbs":6603,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
}


class TeslaScraper(BaseScraper):
    BRAND = "tesla"
    VEHICLES = [
        {"model": "Model 3",    "slug": "model3",     "year": 2025, "body_style": "sedan", "category": "sedan"},
        {"model": "Model Y",    "slug": "modely",     "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "Model S",    "slug": "models",     "year": 2025, "body_style": "sedan", "category": "sedan"},
        {"model": "Model X",    "slug": "modelx",     "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "Cybertruck", "slug": "cybertruck", "year": 2025, "body_style": "truck", "category": "truck"},
    ]

    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = await self._scrape_vehicle(info)
                results.append(doc)
            except Exception as e:
                self.log(f"  Error: {e} -- using curated")
                results.append(self._build(info, [], {}, "curated_fallback"))
            await self.rate_limit(1.5, 3.0)
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"tesla-{info['slug']}-{year}"
        curated = CURATED.get(model, {})

        # --- Step 1: Car and Driver specs (no browser needed) ---
        from scrapers.specs_pipeline import fetch_caranddriver_specs, merge_specs
        cnd_specs = await fetch_caranddriver_specs(vehicle_id)
        specs = merge_specs(curated.get("specs", {}), cnd_specs)
        if cnd_specs:
            self.log(f"  {model}: C&D returned {len(cnd_specs)} spec fields")

        
        # Step 2: US News deals (cash back, APR, lease offers)
        deals = {}
        # try:
        #     from scrapers.usnews_deals_scraper import scrape_make_deals
        #     all_deals = await scrape_make_deals("tesla")
        #     deals = all_deals.get(vehicle_id, {})
        #     if deals:
        #         self.log(f"  {model}: US News returned deals")
        # except Exception as e:
        #     self.log(f"  US News deals failed: {e}")

        # --- Step 3: Tesla.com for pricing (Playwright) ---
        trims = []
        try:
            page = await self.get_browser_page()
            try:
                await page.goto(
                    f"https://www.tesla.com/{info['slug']}/design",
                    wait_until="domcontentloaded", timeout=25000
                )
                await self.rate_limit(1.0, 2.0)
                content = await page.content()
                trims = self._parse_trims(content, model)
            finally:
                await page.close()
        except Exception as e:
            self.log(f"  Playwright failed: {e}")

        # --- Step 4: Curated fallback for pricing ---
        if not trims:
            self.log(f"  {model}: using curated MSRP")
            raw = curated.get("trims", [])
            trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]

        return self._build(info, trims, specs, "caranddriver+curated" if cnd_specs else "curated_fallback")

    def _parse_trims(self, html: str, model: str) -> list[dict]:
        trims = []
        # Tesla __NEXT_DATA__
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(1))
                data_str = json.dumps(data)
                for match in re.findall(r'"(?:price|basePrice|msrp)"\s*:\s*(\d{5,6})', data_str):
                    p = int(match)
                    if 30000 <= p <= 120000:
                        trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                     "financeOffers": [], "leaseOffers": [], "availableColors": []})
            except Exception:
                pass
        # Dedup
        seen: set = set()
        return [t for t in trims if not (t["msrp"] in seen or seen.add(t["msrp"]))][:4]

    def _build(self, info: dict, trims: list, specs: dict, method: str) -> dict:
        base_msrp = min(t["msrp"] for t in trims) if trims else None
        return {
            "id": f"tesla-{info['slug']}-{info['year']}",
            "make": "Tesla", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": f"https://www.tesla.com/{info['slug']}",
            "msrpFrom": base_msrp,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method,
            "specs": specs, "trims": trims,
        }