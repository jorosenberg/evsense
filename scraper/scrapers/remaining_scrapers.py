"""
remaining_scrapers.py - BMW, Volkswagen, Lucid, Polestar scrapers.
Priority: C&D specs -> manufacturer site -> curated
"""
import re
from datetime import datetime, timezone
from scrapers.base_scraper import BaseScraper

CURATED = {
    "bmw": {
        "i4":  {"trims": [("eDrive35",52200),("xDrive40",57900),("M50",67900)],              "specs": {"range":301,"batteryKwh":83.9,"chargingSpeedDcFastKw":205,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.7,"horsepower":335,"torqueLbFt":317,"zeroToSixty":3.9,"topSpeed":140,"seatingCapacity":5,"cargoVolumeCuFt":15.7,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":5.6,"weightLbs":4756,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "iX":  {"trims": [("xDrive40",87100),("xDrive50",98900),("M60",108900)],             "specs": {"range":324,"batteryKwh":111.0,"chargingSpeedDcFastKw":195,"chargingSpeedL2Kw":11.5,"milesPerKwh":2.9,"horsepower":516,"torqueLbFt":564,"zeroToSixty":3.8,"topSpeed":130,"seatingCapacity":5,"cargoVolumeCuFt":77.9,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":7.7,"weightLbs":5765,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "i5":  {"trims": [("eDrive40",67900),("M60 xDrive",84900)],                          "specs": {"range":295,"batteryKwh":84.4,"chargingSpeedDcFastKw":205,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.5,"horsepower":335,"torqueLbFt":317,"zeroToSixty":4.4,"topSpeed":130,"seatingCapacity":5,"cargoVolumeCuFt":18.0,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":5.5,"weightLbs":4872,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "i7":  {"trims": [("xDrive60",111300),("M70 xDrive",185000)],                        "specs": {"range":318,"batteryKwh":101.7,"chargingSpeedDcFastKw":195,"chargingSpeedL2Kw":11.5,"milesPerKwh":3.1,"horsepower":536,"torqueLbFt":549,"zeroToSixty":4.5,"topSpeed":130,"seatingCapacity":5,"cargoVolumeCuFt":13.8,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":5.5,"weightLbs":5385,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    },
    "volkswagen": {
        "ID.4":    {"trims": [("Standard RWD",38995),("Pro S RWD",43995),("Pro S AWD",46995)],"specs": {"range":275,"batteryKwh":82.0,"chargingSpeedDcFastKw":135,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.3,"horsepower":201,"torqueLbFt":229,"zeroToSixty":7.9,"topSpeed":99,"seatingCapacity":5,"cargoVolumeCuFt":64.2,"frunkVolumeCuFt":0,"towingCapacityLbs":2700,"groundClearanceIn":8.1,"weightLbs":4564,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "ID. Buzz":{"trims": [("Standard",59995),("Long Wheelbase",64995)],                   "specs": {"range":234,"batteryKwh":82.0,"chargingSpeedDcFastKw":135,"chargingSpeedL2Kw":11.0,"milesPerKwh":2.8,"horsepower":282,"torqueLbFt":295,"zeroToSixty":6.5,"topSpeed":90,"seatingCapacity":7,"cargoVolumeCuFt":162,"frunkVolumeCuFt":0,"towingCapacityLbs":2200,"groundClearanceIn":8.7,"weightLbs":4940,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    },
    "lucid": {
        "Air":    {"trims": [("Pure",69900),("Touring",107900),("Grand Touring",138000)],     "specs": {"range":516,"batteryKwh":118.0,"chargingSpeedDcFastKw":300,"chargingSpeedL2Kw":19.2,"milesPerKwh":5.0,"horsepower":480,"torqueLbFt":406,"zeroToSixty":3.8,"topSpeed":168,"seatingCapacity":5,"cargoVolumeCuFt":9.9,"frunkVolumeCuFt":0,"towingCapacityLbs":0,"groundClearanceIn":5.1,"weightLbs":4551,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "Gravity":{"trims": [("Grand Touring",94900)],                                        "specs": {"range":440,"batteryKwh":112.0,"chargingSpeedDcFastKw":300,"chargingSpeedL2Kw":19.2,"milesPerKwh":3.7,"horsepower":828,"torqueLbFt":1000,"zeroToSixty":3.5,"topSpeed":130,"seatingCapacity":7,"cargoVolumeCuFt":120,"frunkVolumeCuFt":0,"towingCapacityLbs":6000,"groundClearanceIn":8.0,"weightLbs":6900,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    },
    "polestar": {
        "Polestar 2":{"trims": [("Standard RWD",44900),("Long Range RWD",48900),("Long Range AWD",54900)],"specs": {"range":320,"batteryKwh":82.0,"chargingSpeedDcFastKw":205,"chargingSpeedL2Kw":11.0,"milesPerKwh":3.7,"horsepower":299,"torqueLbFt":339,"zeroToSixty":4.5,"topSpeed":112,"seatingCapacity":5,"cargoVolumeCuFt":14.4,"frunkVolumeCuFt":1.1,"towingCapacityLbs":2000,"groundClearanceIn":5.7,"weightLbs":4317,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "Polestar 3":{"trims": [("Long Range AWD",73400),("Long Range Performance AWD",82400)],"specs": {"range":300,"batteryKwh":111.0,"chargingSpeedDcFastKw":250,"chargingSpeedL2Kw":22.0,"milesPerKwh":2.7,"horsepower":517,"torqueLbFt":671,"zeroToSixty":4.8,"topSpeed":112,"seatingCapacity":5,"cargoVolumeCuFt":64.8,"frunkVolumeCuFt":0,"towingCapacityLbs":4400,"groundClearanceIn":8.3,"weightLbs":5622,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
        "Polestar 4":{"trims": [("Standard RWD",56900),("Long Range RWD",61900),("Long Range AWD",64900)],"specs": {"range":300,"batteryKwh":100.0,"chargingSpeedDcFastKw":200,"chargingSpeedL2Kw":22.0,"milesPerKwh":3.0,"horsepower":272,"torqueLbFt":343,"zeroToSixty":6.2,"topSpeed":112,"seatingCapacity":5,"cargoVolumeCuFt":52.5,"frunkVolumeCuFt":0,"towingCapacityLbs":2000,"groundClearanceIn":7.5,"weightLbs":4894,"chargingPort":"NACS","warrantyYears":4,"batteryWarrantyYears":8,"batteryWarrantyMiles":100000}},
    },
}


def _build(brand: str, info: dict, trims: list, specs: dict, method: str) -> dict:
    slug = info["slug"]
    return {
        "id": f"{brand}-{slug}-{info['year']}",
        "make": info["make"], "model": info["model"], "year": info["year"],
        "type": "new", "category": info["category"], "bodyStyle": info["body_style"],
        "manufacturerUrl": info.get("url", ""),
        "msrpFrom": min(t["msrp"] for t in trims) if trims else None,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "comingSoon": False, "scraperMethod": method, "specs": specs, "trims": trims,
    }


async def _scrape_generic(scraper: BaseScraper, brand: str, info: dict) -> dict:
    """Shared scrape logic: C&D first, then manufacturer, then curated."""
    model = info["model"]
    year = info["year"]
    vehicle_id = f"{brand}-{info['slug']}-{year}"
    curated = CURATED.get(brand, {}).get(model, {})

    # Step 1: C&D specs
    from scrapers.specs_pipeline import fetch_caranddriver_specs, merge_specs
    cnd_specs = await fetch_caranddriver_specs(vehicle_id)
    specs = merge_specs(curated.get("specs", {}), cnd_specs)
    if cnd_specs:
        scraper.log(f"  {model}: C&D returned {len(cnd_specs)} spec fields")

    # Step 2: US News deals
    deals = {}
    try:
        from scrapers.usnews_deals_scraper import scrape_make_deals
        all_deals = await scrape_make_deals(brand)
        deals = all_deals.get(vehicle_id, {})
        if deals:
            scraper.log(f"  {model}: US News returned deals")
    except Exception as e:
        scraper.log(f"  US News deals failed: {e}")

    # Step 3: Manufacturer site for pricing
    trims = []
    try:
        page = await scraper.get_browser_page()
        try:
            await page.goto(info["url"], wait_until="domcontentloaded", timeout=22000)
            await scraper.rate_limit(1.0, 2.0)
            state_json = await page.evaluate(
                "() => { try { return JSON.stringify(window.__NEXT_DATA__ || window.__PRELOADED_STATE__ || null); } catch(e) { return null; } }"
            )
            if state_json:
                for m in re.findall(r'"(?:price|msrp|basePrice|vehiclePrice)"\s*:\s*(\d{5,6})', state_json):
                    p = int(m)
                    if 35000 <= p <= 200000:
                        trims.append({"name": f"Trim {len(trims)+1}", "msrp": p,
                                     "financeOffers": [], "leaseOffers": [], "availableColors": []})
        finally:
            await page.close()
    except Exception as e:
        scraper.log(f"  Playwright failed: {e}")

    # Step 4: Curated MSRP
    if not trims:
        scraper.log(f"  {model}: using curated MSRP")
        raw = curated.get("trims", [])
        trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
        doc = _build(brand, info, trims, specs, "caranddriver+curated" if cnd_specs else "curated_fallback")
        if deals:
            doc["currentDeals"] = deals
        return doc

    seen: set = set()
    trims = [t for t in trims if not (t["msrp"] in seen or seen.add(t["msrp"]))][:4]
    doc = _build(brand, info, trims, specs, "caranddriver+manufacturer" if cnd_specs else "manufacturer")
    if deals:
        doc["currentDeals"] = deals
    return doc


class BMWScraper(BaseScraper):
    BRAND = "bmw"
    VEHICLES = [
        {"make": "BMW", "model": "i4",  "slug": "i4",  "year": 2025, "body_style": "sedan", "category": "sedan", "url": "https://www.bmwusa.com/vehicles/i4/sedan/build-your-own.html"},
        {"make": "BMW", "model": "iX",  "slug": "ix",  "year": 2025, "body_style": "suv",   "category": "suv",   "url": "https://www.bmwusa.com/vehicles/ix/sports-activity-vehicle/build-your-own.html"},
        {"make": "BMW", "model": "i5",  "slug": "i5",  "year": 2025, "body_style": "sedan", "category": "sedan", "url": "https://www.bmwusa.com/vehicles/i5/sedan/build-your-own.html"},
        {"make": "BMW", "model": "i7",  "slug": "i7",  "year": 2025, "body_style": "sedan", "category": "sedan", "url": "https://www.bmwusa.com/vehicles/i7/sedan/build-your-own.html"},
    ]
    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                results.append(await _scrape_generic(self, "bmw", info))
            except Exception as e:
                self.log(f"  Error: {e}")
                curated = CURATED["bmw"].get(info["model"], {})
                raw = curated.get("trims", [])
                trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
                results.append(_build("bmw", info, trims, curated.get("specs", {}), "curated_fallback"))
            await self.rate_limit(2.0, 4.0)
        return results


class VolkswagenScraper(BaseScraper):
    BRAND = "volkswagen"
    VEHICLES = [
        {"make": "Volkswagen", "model": "ID.4",    "slug": "id4",     "year": 2025, "body_style": "suv", "category": "suv", "url": "https://www.vw.com/en/models/id4/builder.html"},
        {"make": "Volkswagen", "model": "ID. Buzz", "slug": "id-buzz", "year": 2025, "body_style": "van", "category": "van", "url": "https://www.vw.com/en/models/id-buzz/builder.html"},
    ]
    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                results.append(await _scrape_generic(self, "volkswagen", info))
            except Exception as e:
                self.log(f"  Error: {e}")
                curated = CURATED["volkswagen"].get(info["model"], {})
                raw = curated.get("trims", [])
                trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
                results.append(_build("volkswagen", info, trims, curated.get("specs", {}), "curated_fallback"))
            await self.rate_limit(2.0, 4.0)
        return results


class LucidScraper(BaseScraper):
    BRAND = "lucid"
    VEHICLES = [
        {"make": "Lucid", "model": "Air",     "slug": "air",     "year": 2025, "body_style": "sedan", "category": "sedan", "url": "https://lucidmotors.com/air/configure"},
        {"make": "Lucid", "model": "Gravity", "slug": "gravity", "year": 2025, "body_style": "suv",   "category": "suv",   "url": "https://lucidmotors.com/gravity/configure"},
    ]
    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                results.append(await _scrape_generic(self, "lucid", info))
            except Exception as e:
                self.log(f"  Error: {e}")
                curated = CURATED["lucid"].get(info["model"], {})
                raw = curated.get("trims", [])
                trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
                results.append(_build("lucid", info, trims, curated.get("specs", {}), "curated_fallback"))
            await self.rate_limit(2.0, 4.0)
        return results


class PolestarScraper(BaseScraper):
    BRAND = "polestar"
    VEHICLES = [
        {"make": "Polestar", "model": "Polestar 2", "slug": "polestar-2", "year": 2025, "body_style": "sedan", "category": "sedan", "url": "https://www.polestar.com/us/polestar-2/"},
        {"make": "Polestar", "model": "Polestar 3", "slug": "polestar-3", "year": 2025, "body_style": "suv",   "category": "suv",   "url": "https://www.polestar.com/us/polestar-3/"},
        {"make": "Polestar", "model": "Polestar 4", "slug": "polestar-4", "year": 2025, "body_style": "suv",   "category": "suv",   "url": "https://www.polestar.com/us/polestar-4/"},
    ]
    async def scrape(self) -> list[dict]:
        results = []
        for info in self.VEHICLES:
            self.log(f"Scraping {info['model']}...")
            try:
                results.append(await _scrape_generic(self, "polestar", info))
            except Exception as e:
                self.log(f"  Error: {e}")
                curated = CURATED["polestar"].get(info["model"], {})
                raw = curated.get("trims", [])
                trims = [{"name": n, "msrp": p, "financeOffers": [], "leaseOffers": [], "availableColors": []} for n, p in raw]
                results.append(_build("polestar", info, trims, curated.get("specs", {}), "curated_fallback"))
            await self.rate_limit(2.0, 4.0)
        return results