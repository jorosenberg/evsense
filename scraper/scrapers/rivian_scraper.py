"""
rivian_scraper.py - Scrapes Rivian pricing and specs.
Priority: C&D specs -> Rivian.com -> curated
"""
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "R1T": {"trims": [("Dual-Motor Standard",69900),("Dual-Motor Max",79900),("Quad-Motor Max",99900)], "specs": {"range":410,"batteryKwh":135.0,"chargingSpeedDcFastKw":220,"chargingSpeedL2Kw":11.5,"milesPerKwh":2.8,"horsepower":835,"torqueLbFt":908,"zeroToSixty":3.0,"topSpeed":110,"seatingCapacity":5,"cargoVolumeCuFt":65,"frunkVolumeCuFt":11,"towingCapacityLbs":11000,"groundClearanceIn":14.9,"weightLbs":7148,"chargingPort":"NACS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":175000}},
    "R1S": {"trims": [("Dual-Motor Standard",75900),("Dual-Motor Max",85900),("Quad-Motor Max",105900)],"specs": {"range":389,"batteryKwh":135.0,"chargingSpeedDcFastKw":220,"chargingSpeedL2Kw":11.5,"milesPerKwh":2.7,"horsepower":835,"torqueLbFt":908,"zeroToSixty":3.0,"topSpeed":110,"seatingCapacity":7,"cargoVolumeCuFt":104,"frunkVolumeCuFt":11,"towingCapacityLbs":7700,"groundClearanceIn":14.9,"weightLbs":7650,"chargingPort":"NACS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":175000}},
    "R2":  {"trims": [("Base",45000)],                                                                   "specs": {"range":300,"batteryKwh":82.0,"chargingSpeedDcFastKw":150,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.5,"horsepower":300,"torqueLbFt":310,"zeroToSixty":4.5,"topSpeed":112,"seatingCapacity":5,"chargingPort":"NACS","warrantyYears":5,"batteryWarrantyYears":8,"batteryWarrantyMiles":175000}},
}


class RivianScraper(BaseScraper):
    BRAND = "rivian"
    VEHICLES = [
        {"model": "R1T", "slug": "r1t", "year": 2025, "body_style": "truck", "category": "truck"},
        {"model": "R1S", "slug": "r1s", "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "R2",  "slug": "r2",  "year": 2025, "body_style": "suv",   "category": "suv", "coming_soon": True},
    ]

    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            if info.get("coming_soon"):
                curated = CURATED.get(info["model"], {})
                raw = curated.get("trims", [])
                trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
                results.append({
                    "id": f"rivian-{info['slug']}-{info['year']}",
                    "make": "Rivian", "model": info["model"], "year": info["year"],
                    "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
                    "manufacturerUrl": f"https://rivian.com/{info['slug']}",
                    "msrpFrom": trims[0]["msrp"] if trims else None,
                    "lastUpdated": datetime.now(timezone.utc).isoformat(),
                    "comingSoon": True, "scraperMethod": "curated_fallback",
                    "specs": curated.get("specs", {}), "trims": trims,
                })
                continue
            try:
                doc = await self._scrape_vehicle(info)
                results.append(doc)
            except Exception as e:
                self.log(f"  Error: {e}")
                results.append(self._build_curated(info))
            await self.rate_limit(2.0, 4.0)
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"rivian-{info['slug']}-{year}"
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
            all_deals = await scrape_make_deals("rivian")
            deals = all_deals.get(vehicle_id, {})
            if deals:
                self.log(f"  {model}: US News returned deals")
        except Exception as e:
            self.log(f"  US News deals failed: {e}")

        # Step 3: Rivian.com (times out often -- short timeout)
        trims = []
        try:
            page = await self.get_browser_page()
            try:
                await page.goto(f"https://rivian.com/{info['slug']}",
                                wait_until="domcontentloaded", timeout=20000)
                await self.rate_limit(1.0, 2.0)
                state_json = await page.evaluate(
                    "() => { try { return JSON.stringify(window.__NUXT__ || window.__NEXT_DATA__ || null); } catch(e) { return null; } }"
                )
                if state_json:
                    for m in re.findall(r'"(?:price|startingPrice)"\s*:\s*(\d{5,6})', state_json):
                        p = int(m)
                        if 40000 <= p <= 130000:
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
        raw = curated.get("trims", [])
        trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
        return self._build(info, trims, specs or curated.get("specs", {}), "curated_fallback")

    def _build(self, info: dict, trims: list, specs: dict, method: str) -> dict:
        return {
            "id": f"rivian-{info['slug']}-{info['year']}",
            "make": "Rivian", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": f"https://rivian.com/{info['slug']}",
            "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
        }