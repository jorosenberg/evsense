"""
chevrolet_scraper.py - Scrapes Chevrolet EV pricing and specs.
Priority: C&D specs -> Chevrolet.com -> curated
"""
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "Equinox EV":   {"trims": [("LS FWD",34995),("1LT FWD",36995),("2RS AWD",41995)],     "specs": {"range":319,"batteryKwh":82.7,"chargingSpeedDcFastKw":150,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.8,"horsepower":213,"torqueLbFt":242,"zeroToSixty":7.0,"topSpeed":100,"seatingCapacity":5,"cargoVolumeCuFt":57.1,"frunkVolumeCuFt":0,"towingCapacityLbs":1000,"groundClearanceIn":8.2,"weightLbs":4034,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    "Blazer EV":    {"trims": [("LT FWD",42995),("2LT FWD",46995),("RS AWD",56995)],       "specs": {"range":320,"batteryKwh":85.0,"chargingSpeedDcFastKw":190,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.5,"horsepower":557,"torqueLbFt":648,"zeroToSixty":4.0,"topSpeed":125,"seatingCapacity":5,"cargoVolumeCuFt":64.4,"frunkVolumeCuFt":0,"towingCapacityLbs":1000,"groundClearanceIn":8.0,"weightLbs":4616,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    "Silverado EV": {"trims": [("Work Truck",41995),("LT",57995),("RST",74995)],            "specs": {"range":450,"batteryKwh":200.0,"chargingSpeedDcFastKw":350,"chargingSpeedL2Kw":19.2,"milesPerKwh":2.2,"horsepower":754,"torqueLbFt":785,"zeroToSixty":4.5,"topSpeed":106,"seatingCapacity":5,"cargoVolumeCuFt":72,"frunkVolumeCuFt":11,"towingCapacityLbs":10000,"groundClearanceIn":8.9,"weightLbs":8532,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
}


class ChevroletScraper(BaseScraper):
    BRAND = "chevrolet"
    VEHICLES = [
        {"model": "Equinox EV",   "slug": "equinox-ev",   "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "Blazer EV",    "slug": "blazer-ev",    "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "Silverado EV", "slug": "silverado-ev", "year": 2025, "body_style": "truck", "category": "truck"},
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
            await self.rate_limit(2.0, 3.5)
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"chevrolet-{info['slug']}-{year}"
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
            all_deals = await scrape_make_deals("chevrolet")
            deals = all_deals.get(vehicle_id, {})
            if deals:
                self.log(f"  {model}: US News returned deals")
        except Exception as e:
            self.log(f"  US News deals failed: {e}")

        # Step 3: Chevrolet.com via httpx (blocks Playwright)
        trims = []
        try:
            resp = await self._http_client.get(
                f"https://www.chevrolet.com/electric/{info['slug']}",
                headers={"User-Agent": self.USER_AGENT, "Accept": "text/html"},
                timeout=20,
            )
            if resp.status_code == 200:
                for m in re.findall(r'"(?:price|msrp|baseMsrp)"\s*:\s*(\d{4,6})', resp.text):
                    p = int(m)
                    if 25000 <= p <= 120000:
                        trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                     "financeOffers": [], "leaseOffers": [], "availableColors": []})
                seen: set = set()
                trims = [t for t in trims if not (t["msrp"] in seen or seen.add(t["msrp"]))][:4]
        except Exception as e:
            self.log(f"  httpx failed: {e}")

        if not trims:
            return self._build_curated(info, specs)

        return self._build(info, trims, specs, "caranddriver+manufacturer" if cnd_specs else "manufacturer")

    def _build_curated(self, info: dict, specs: dict = None) -> dict:
        curated = CURATED.get(info["model"], {})
        raw_trims = curated.get("trims", [])
        trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw_trims]
        return self._build(info, trims, specs or curated.get("specs", {}), "curated_fallback")

    def _build(self, info: dict, trims: list, specs: dict, method: str) -> dict:
        return {
            "id": f"chevrolet-{info['slug']}-{info['year']}",
            "make": "Chevrolet", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": f"https://www.chevrolet.com/electric/{info['slug']}",
            "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
        }