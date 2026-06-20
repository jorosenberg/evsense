"""
hyundai_scraper.py - Scrapes Hyundai EV pricing, specs, and deals.

Pipeline per vehicle:
  1. Car and Driver specs (httpx, no browser)
  2. US News deals (Playwright -- cash back, APR, lease offers)
  3. Hyundai.com pricing (Playwright)
  4. Curated static fallback
"""
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "IONIQ 5": {
        "trims": [("SE Standard RWD",41450),("SE Long Range RWD",46450),("SEL Long Range AWD",51450)],
        "specs": {"range":303,"batteryKwh":77.4,"chargingSpeedDcFastKw":233,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.7,"horsepower":225,"torqueLbFt":258,"zeroToSixty":5.1,"topSpeed":115,"seatingCapacity":5,"cargoVolumeCuFt":27.2,"frunkVolumeCuFt":0,"towingCapacityLbs":1650,"groundClearanceIn":6.7,"weightLbs":4630,"chargingPort":"CCS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
    },
    "IONIQ 6": {
        "trims": [("SE Standard RWD",38615),("SE Long Range RWD",42615),("SEL Long Range AWD",48615)],
        "specs": {"range":361,"batteryKwh":77.4,"chargingSpeedDcFastKw":233,"chargingSpeedL2Kw":11.0,"milesPerKwh":5.1,"horsepower":225,"torqueLbFt":258,"zeroToSixty":5.1,"topSpeed":115,"seatingCapacity":5,"cargoVolumeCuFt":11.1,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":5.9,"weightLbs":4365,"chargingPort":"CCS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
    },
    "IONIQ 9": {
        "trims": [("SE Long Range AWD",68490)],
        "specs": {"range":300,"batteryKwh":110.3,"chargingSpeedDcFastKw":350,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.1,"horsepower":422,"torqueLbFt":516,"zeroToSixty":5.0,"topSpeed":115,"seatingCapacity":7,"chargingPort":"CCS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
    },
}


class HyundaiScraper(BaseScraper):
    BRAND = "hyundai"
    VEHICLES = [
        {"model": "IONIQ 5", "slug": "ioniq-5", "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "IONIQ 6", "slug": "ioniq-6", "year": 2025, "body_style": "sedan", "category": "sedan"},
        {"model": "IONIQ 9", "slug": "ioniq-9", "year": 2025, "body_style": "suv",   "category": "suv"},
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
                results.append(self._build_curated(info))
            await self.rate_limit()
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"hyundai-{info['slug']}-{year}"
        curated = CURATED.get(model, {})

        # Step 1: Car and Driver specs
        from scrapers.specs_pipeline import fetch_caranddriver_specs, merge_specs
        cnd_specs = await fetch_caranddriver_specs(vehicle_id)
        specs = merge_specs(curated.get("specs", {}), cnd_specs)
        if cnd_specs:
            self.log(f"  {model}: C&D returned {len(cnd_specs)} spec fields")

        # Step 2: US News deals
        deals = {}
        try:
            from scrapers.usnews_deals_scraper import scrape_make_deals
            all_deals = await scrape_make_deals("hyundai")
            deals = all_deals.get(vehicle_id, {})
            if deals:
                self.log(f"  {model}: US News returned {len(deals.get('cashBack',[])) + len(deals.get('financeDeals',[])) + len(deals.get('leaseDeals',[]))} deal(s)")
        except Exception as e:
            self.log(f"  US News deals failed: {e}")

        # Step 3: Hyundai.com for pricing
        trims = []
        try:
            page = await self.get_browser_page()
            try:
                await page.goto(
                    f"https://www.hyundaiusa.com/us/en/vehicles/{info['slug']}/build",
                    wait_until="domcontentloaded", timeout=25000
                )
                await self.rate_limit(1.0, 2.0)
                state_json = await page.evaluate(
                    "() => { try { return JSON.stringify(window.__INITIAL_STATE__ || null); } catch(e) { return null; } }"
                )
                if state_json:
                    for m in re.findall(r'"(?:price|msrp|baseMsrp)"\s*:\s*(\d{4,6})', state_json):
                        p = int(m)
                        if 30000 <= p <= 90000:
                            trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                         "financeOffers": [], "leaseOffers": [], "availableColors": []})
            finally:
                await page.close()
        except Exception as e:
            self.log(f"  Playwright failed: {e}")

        # Step 4: Curated pricing fallback
        if not trims:
            self.log(f"  {model}: using curated MSRP")
            raw = curated.get("trims", [])
            trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]

        sources = []
        if cnd_specs: sources.append("caranddriver")
        if deals: sources.append("usnews")
        sources.append("manufacturer" if len(trims) > len(curated.get("trims", [])) else "curated")
        method = "+".join(sources)

        doc = self._build(info, trims, specs, method)
        if deals:
            doc["currentDeals"] = deals
        return doc

    def _build_curated(self, info: dict) -> dict:
        curated = CURATED.get(info["model"], {})
        raw = curated.get("trims", [])
        trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
        return self._build(info, trims, curated.get("specs", {}), "curated_fallback")

    def _build(self, info: dict, trims: list, specs: dict, method: str) -> dict:
        return {
            "id": f"hyundai-{info['slug']}-{info['year']}",
            "make": "Hyundai", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": f"https://www.hyundaiusa.com/us/en/vehicles/{info['slug']}",
            "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
        }