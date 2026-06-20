"""
kia_scraper.py - Scrapes Kia EV pricing and specs.
Priority: C&D specs -> Kia.com -> curated
"""
import re, json
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "EV6": {"trims": [("Light RWD",42600),("Wind AWD",49600),("GT AWD",61600)],           "specs": {"range":310,"batteryKwh":77.4,"chargingSpeedDcFastKw":233,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.9,"horsepower":225,"torqueLbFt":258,"zeroToSixty":5.1,"topSpeed":115,"seatingCapacity":5,"cargoVolumeCuFt":24.4,"frunkVolumeCuFt":1.1,"towingCapacityLbs":2300,"groundClearanceIn":6.1,"weightLbs":4255,"chargingPort":"CCS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    "EV9": {"trims": [("Light RWD",54900),("Wind AWD",60900),("GT-Line AWD",67900)],       "specs": {"range":304,"batteryKwh":99.8,"chargingSpeedDcFastKw":233,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.1,"horsepower":379,"torqueLbFt":443,"zeroToSixty":5.0,"topSpeed":115,"seatingCapacity":7,"cargoVolumeCuFt":82.9,"frunkVolumeCuFt":0,"towingCapacityLbs":5000,"groundClearanceIn":7.4,"weightLbs":5490,"chargingPort":"CCS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
}


class KiaScraper(BaseScraper):
    BRAND = "kia"
    VEHICLES = [
        {"model": "EV6", "slug": "ev6", "year": 2025, "body_style": "suv", "category": "suv"},
        {"model": "EV9", "slug": "ev9", "year": 2025, "body_style": "suv", "category": "suv"},
    ]

    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                doc = await self._scrape_vehicle(info)
                results.append(doc)
            except Exception as e:
                self.log(f"  Error: {e}")
                results.append(self._build_curated(info))
            await self.rate_limit()
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"kia-{info['slug']}-{year}"
        curated = CURATED.get(model, {})

        # Step 1: C&D specs
        from scrapers.specs_pipeline import fetch_caranddriver_specs, merge_specs
        cnd_specs = await fetch_caranddriver_specs(vehicle_id)
        specs = merge_specs(curated.get("specs", {}), cnd_specs)
        if cnd_specs:
            self.log(f"  {model}: C&D returned {len(cnd_specs)} spec fields")

        
        # Step 2: US News deals (cash back, APR, lease offers)
        deals = {}
        try:
            from scrapers.usnews_deals_scraper import scrape_make_deals
            all_deals = await scrape_make_deals("kia")
            deals = all_deals.get(vehicle_id, {})
            if deals:
                self.log(f"  {model}: US News returned deals")
        except Exception as e:
            self.log(f"  US News deals failed: {e}")

        # Step 3: Kia.com for pricing
        trims = []
        try:
            page = await self.get_browser_page()
            try:
                await page.goto(f"https://www.kia.com/us/en/{info['slug']}/build",
                                wait_until="domcontentloaded", timeout=25000)
                await self.rate_limit(1.0, 2.0)
                state_json = await page.evaluate(
                    "() => { try { return JSON.stringify(window.__NEXT_DATA__ || window.__INITIAL_STATE__ || null); } catch(e) { return null; } }"
                )
                if state_json:
                    data_str = state_json
                    for m in re.findall(r'"(?:price|msrp|totalMsrp)"\s*:\s*(\d{5,6})', data_str):
                        p = int(m)
                        if 35000 <= p <= 100000:
                            trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                         "financeOffers": [], "leaseOffers": [], "availableColors": []})
            finally:
                await page.close()
        except Exception as e:
            self.log(f"  Playwright failed: {e}")

        if not trims:
            return self._build_curated(info, specs)

        seen: set = set()
        trims = [t for t in trims if not (t["msrp"] in seen or seen.add(t["msrp"]))][:4]
        return self._build(info, trims, specs, "caranddriver+manufacturer" if cnd_specs else "manufacturer")

    def _build_curated(self, info: dict, specs: dict = None) -> dict:
        curated = CURATED.get(info["model"], {})
        raw_trims = curated.get("trims", [])
        trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw_trims]
        return self._build(info, trims, specs or curated.get("specs", {}), "curated_fallback")

    def _build(self, info: dict, trims: list, specs: dict, method: str) -> dict:
        return {
            "id": f"kia-{info['slug']}-{info['year']}",
            "make": "Kia", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": f"https://www.kia.com/us/en/{info['slug']}",
            "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
        }