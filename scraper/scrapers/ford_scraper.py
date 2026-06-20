"""
ford_scraper.py - Scrapes Ford EV pricing, specs, and deals.

Pipeline per vehicle:
  1. Car and Driver specs (httpx, no browser)
  2. US News deals (Playwright -- cash back, APR, lease offers)
  3. Ford.com via httpx (blocks Playwright HTTP2)
  4. Curated static fallback

Correct Ford URLs (2025):
  Mach-E:     https://www.ford.com/suvs/mach-e/
  Lightning:  https://www.ford.com/trucks/f150/f-150-lightning/
  E-Transit:  https://www.ford.com/commercial-trucks/e-transit/
"""
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "Mustang Mach-E": {
        "trims": [("Select RWD",42995),("Premium RWD",46995),("Premium AWD",51995),("GT AWD",59995)],
        "specs": {"range":312,"batteryKwh":91.0,"chargingSpeedDcFastKw":115,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.5,"horsepower":266,"torqueLbFt":317,"zeroToSixty":5.8,"topSpeed":115,"seatingCapacity":5,"cargoVolumeCuFt":59.7,"frunkVolumeCuFt":4.8,"towingCapacityLbs":2000,"groundClearanceIn":6.3,"weightLbs":4394,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
        "url": "https://www.ford.com/suvs/mach-e/",
    },
    "F-150 Lightning": {
        "trims": [("Pro",49995),("XLT",54995),("Lariat",69995),("Platinum",91995)],
        "specs": {"range":320,"batteryKwh":131.0,"chargingSpeedDcFastKw":150,"chargingSpeedL2Kw":19.2,"milesPerKwh":2.4,"horsepower":452,"torqueLbFt":775,"zeroToSixty":4.5,"topSpeed":100,"seatingCapacity":5,"cargoVolumeCuFt":78,"frunkVolumeCuFt":14.1,"towingCapacityLbs":10000,"groundClearanceIn":8.9,"weightLbs":6015,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
        "url": "https://www.ford.com/trucks/f150/f-150-lightning/",
    },
    "E-Transit": {
        "trims": [("Cargo Van",51995),("Cargo Wagon",54995)],
        "specs": {"range":159,"batteryKwh":68.0,"chargingSpeedDcFastKw":50,"chargingSpeedL2Kw":11.3,"milesPerKwh":2.1,"horsepower":266,"torqueLbFt":317,"zeroToSixty":0,"topSpeed":80,"seatingCapacity":3,"chargingPort":"NACS","warrantyYears":3,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000},
        "url": "https://www.ford.com/commercial-trucks/e-transit/",
    },
}


class FordScraper(BaseScraper):
    BRAND = "ford"
    VEHICLES = [
        {"model": "Mustang Mach-E", "slug": "mustang-mach-e", "year": 2025, "body_style": "suv",   "category": "suv"},
        {"model": "F-150 Lightning","slug": "f-150-lightning", "year": 2025, "body_style": "truck", "category": "truck"},
        {"model": "E-Transit",      "slug": "e-transit",       "year": 2025, "body_style": "van",   "category": "van"},
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
            await self.rate_limit(2.0, 3.5)
        return results

    async def _scrape_vehicle(self, info: dict) -> dict:
        model = info["model"]
        year = info["year"]
        vehicle_id = f"ford-{info['slug']}-{year}"
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
            all_deals = await scrape_make_deals("ford")
            deals = all_deals.get(vehicle_id, {})
            if deals:
                self.log(f"  {model}: US News returned deals")
        except Exception as e:
            self.log(f"  US News deals failed: {e}")

        # Step 3: Ford.com via httpx (Playwright blocked by HTTP2 error)
        trims = []
        url = curated.get("url", "")
        try:
            resp = await self._http_client.get(
                url,
                headers={"User-Agent": self.USER_AGENT, "Accept": "text/html"},
                timeout=20,
            )
            if resp.status_code == 200:
                for m in re.findall(r'"(?:price|msrp|basePrice|startingMsrp)"\s*:\s*(\d{4,6})', resp.text):
                    p = int(m)
                    if 25000 <= p <= 130000:
                        trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                     "financeOffers": [], "leaseOffers": [], "availableColors": []})
                seen: set = set()
                trims = [t for t in trims if not (t["msrp"] in seen or seen.add(t["msrp"]))][:4]
                if trims:
                    self.log(f"  {model}: {len(trims)} trim(s) from Ford.com")
        except Exception as e:
            self.log(f"  httpx failed: {e}")

        # Step 4: Curated pricing fallback
        if not trims:
            self.log(f"  {model}: using curated MSRP")
            raw = curated.get("trims", [])
            trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]

        sources = []
        if cnd_specs: sources.append("caranddriver")
        if deals: sources.append("usnews")
        sources.append("manufacturer" if len(trims) > 0 and not any(t["name"].startswith("Trim") for t in trims) else "curated")
        method = "+".join(sources) if sources else "curated_fallback"

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
        curated = CURATED.get(info["model"], {})
        return {
            "id": f"ford-{info['slug']}-{info['year']}",
            "make": "Ford", "model": info["model"], "year": info["year"],
            "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
            "manufacturerUrl": curated.get("url", "https://www.ford.com/"),
            "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
        }