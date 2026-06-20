"""
generate_mock_data.py — Build static vehicle JSONs for the frontend.

Produces:
  - frontend/public/data/vehicles_summary.json   (Browse-grid summary)
  - frontend/public/data/vehicles/{id}.json      (Full detail per vehicle)

Run from repo root:
  python scripts/generate_mock_data.py
"""

from __future__ import annotations
import json
import os
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "frontend" / "public" / "data"
DETAIL_DIR = OUT_DIR / "vehicles"

NOW_ISO = datetime.now(timezone.utc).isoformat(timespec="seconds")
OFFER_EXPIRY_ISO = "2026-06-30T23:59:59+00:00"

# ─── Image source helpers ────────────────────────────────────────────────────
# We use Wikimedia / manufacturer-style URLs for visual placeholders.
# Replace with manufacturer CDN URLs once the scraper is live.

def img(slug: str, idx: int = 1) -> str:
    """Return a stable placeholder image URL keyed off the vehicle slug."""
    return f"https://images.weserv.nl/?url=cdn.imagin.studio/getimage?customer=demo&make={slug}&modelFamily={slug}&angle={idx}&zoomType=fullscreen"


# Map of (id) -> well-known landscape images (manufacturer press shots / Wikipedia).
HERO_IMAGES = {
    "tesla-model3-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/2024_Tesla_Model_3_Highland_facelift_RHD_UK.jpg/1280px-2024_Tesla_Model_3_Highland_facelift_RHD_UK.jpg",
    "tesla-modely-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/2020_Tesla_Model_Y_Long_Range_Front.jpg/1280px-2020_Tesla_Model_Y_Long_Range_Front.jpg",
    "tesla-models-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/2018_Tesla_Model_S_75D_Front.jpg/1280px-2018_Tesla_Model_S_75D_Front.jpg",
    "tesla-modelx-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Tesla_Model_X_in_Lyon.jpg/1280px-Tesla_Model_X_in_Lyon.jpg",
    "tesla-cybertruck-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Tesla_Cybertruck_outside_Petersen_Museum.jpg/1280px-Tesla_Cybertruck_outside_Petersen_Museum.jpg",
    "hyundai-ioniq-5-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Hyundai_Ioniq_5_IMG_4865.jpg/1280px-Hyundai_Ioniq_5_IMG_4865.jpg",
    "hyundai-ioniq-6-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Hyundai_Ioniq_6_2023_%282%29.jpg/1280px-Hyundai_Ioniq_6_2023_%282%29.jpg",
    "hyundai-ioniq-9-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/2025_Hyundai_Ioniq_9.jpg/1280px-2025_Hyundai_Ioniq_9.jpg",
    "kia-ev6-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Kia_EV6_GT-Line_AWD_2022_%281Y7A5879%29.jpg/1280px-Kia_EV6_GT-Line_AWD_2022_%281Y7A5879%29.jpg",
    "kia-ev9-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Kia_EV9_IMG_8780.jpg/1280px-Kia_EV9_IMG_8780.jpg",
    "ford-mustang-mach-e-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/2021_Ford_Mustang_Mach-E_AWD_%2854%29.jpg/1280px-2021_Ford_Mustang_Mach-E_AWD_%2854%29.jpg",
    "ford-f-150-lightning-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/2022_Ford_F-150_Lightning_Lariat_in_Iconic_Silver%2C_front_left.jpg/1280px-2022_Ford_F-150_Lightning_Lariat_in_Iconic_Silver%2C_front_left.jpg",
    "ford-e-transit-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Ford_E-Transit_350L_Trend_2022_%281Y7A6203%29.jpg/1280px-Ford_E-Transit_350L_Trend_2022_%281Y7A6203%29.jpg",
    "chevrolet-equinox-ev-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/2024_Chevrolet_Equinox_EV_2LT_front_5.21.24.jpg/1280px-2024_Chevrolet_Equinox_EV_2LT_front_5.21.24.jpg",
    "chevrolet-blazer-ev-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/2024_Chevrolet_Blazer_EV_RS%2C_front_5.27.24.jpg/1280px-2024_Chevrolet_Blazer_EV_RS%2C_front_5.27.24.jpg",
    "chevrolet-silverado-ev-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/2024_Chevrolet_Silverado_EV_RST_front_3.27.24.jpg/1280px-2024_Chevrolet_Silverado_EV_RST_front_3.27.24.jpg",
    "rivian-r1t-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/2022_Rivian_R1T_in_Glacier_White%2C_Front_Left.jpg/1280px-2022_Rivian_R1T_in_Glacier_White%2C_Front_Left.jpg",
    "rivian-r1s-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/2023_Rivian_R1S_front_5.6.23.jpg/1280px-2023_Rivian_R1S_front_5.6.23.jpg",
    "rivian-r2-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/2026_Rivian_R2.jpg/1280px-2026_Rivian_R2.jpg",
    "bmw-i4-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/2022_BMW_i4_eDrive40_Sport_Front.jpg/1280px-2022_BMW_i4_eDrive40_Sport_Front.jpg",
    "bmw-i5-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/BMW_i5_M60_xDrive_%28G60%29_IMG_8870.jpg/1280px-BMW_i5_M60_xDrive_%28G60%29_IMG_8870.jpg",
    "bmw-i7-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/BMW_i7_xDrive60_IMG_4855.jpg/1280px-BMW_i7_xDrive60_IMG_4855.jpg",
    "bmw-ix-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/BMW_iX_xDrive50_IMG_4837.jpg/1280px-BMW_iX_xDrive50_IMG_4837.jpg",
    "volkswagen-id4-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Volkswagen_ID.4_GTX_IMG_5174.jpg/1280px-Volkswagen_ID.4_GTX_IMG_5174.jpg",
    "volkswagen-id-buzz-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/2024_Volkswagen_ID._Buzz_Pro%2C_front_left_%28US%29.jpg/1280px-2024_Volkswagen_ID._Buzz_Pro%2C_front_left_%28US%29.jpg",
    "lucid-air-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/2022_Lucid_Air_Grand_Touring%2C_front_4.18.22.jpg/1280px-2022_Lucid_Air_Grand_Touring%2C_front_4.18.22.jpg",
    "lucid-gravity-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Lucid_Gravity_at_2024_LA_Auto_Show.jpg/1280px-Lucid_Gravity_at_2024_LA_Auto_Show.jpg",
    "polestar-polestar-2-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Polestar_2_IAA_2021_1X7A0252.jpg/1280px-Polestar_2_IAA_2021_1X7A0252.jpg",
    "polestar-polestar-3-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Polestar_3_at_IAA_2023_1X7A0070.jpg/1280px-Polestar_3_at_IAA_2023_1X7A0070.jpg",
    "polestar-polestar-4-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Polestar_4_at_IAA_2023_1X7A0064.jpg/1280px-Polestar_4_at_IAA_2023_1X7A0064.jpg",
}

INTERIOR_IMAGES = {
    "tesla-model3-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Tesla_Model_3_Highland_Interior.jpg/1280px-Tesla_Model_3_Highland_Interior.jpg",
    "tesla-modely-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/2020_Tesla_Model_Y_Interior.jpg/1280px-2020_Tesla_Model_Y_Interior.jpg",
    "hyundai-ioniq-5-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Hyundai_Ioniq_5_IMG_4870.jpg/1280px-Hyundai_Ioniq_5_IMG_4870.jpg",
    "kia-ev6-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Kia_EV6_Interior.jpg/1280px-Kia_EV6_Interior.jpg",
    "rivian-r1t-2025": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Rivian_R1T_Interior.jpg/1280px-Rivian_R1T_Interior.jpg",
}


# ─── Color palettes (reused across trims) ────────────────────────────────────
TESLA_COLORS = [
    {"name": "Pearl White Multi-Coat", "hexPreview": "#F0F0EC", "pricePremium": 0},
    {"name": "Stealth Grey", "hexPreview": "#6B6B6B", "pricePremium": 0},
    {"name": "Deep Blue Metallic", "hexPreview": "#2B4C7E", "pricePremium": 1000},
    {"name": "Ultra Red", "hexPreview": "#8B1A1A", "pricePremium": 2000},
    {"name": "Solid Black", "hexPreview": "#0A0A0A", "pricePremium": 1500},
]
NEUTRAL_COLORS = [
    {"name": "Pearl White", "hexPreview": "#F2F2EE", "pricePremium": 0},
    {"name": "Magnetic Silver", "hexPreview": "#9CA2A8", "pricePremium": 0},
    {"name": "Phantom Black", "hexPreview": "#101012", "pricePremium": 595},
    {"name": "Lucid Blue", "hexPreview": "#2A4A78", "pricePremium": 595},
    {"name": "Cherry Red", "hexPreview": "#7E1818", "pricePremium": 995},
]
RIVIAN_COLORS = [
    {"name": "Glacier White", "hexPreview": "#F2F4F4", "pricePremium": 0},
    {"name": "Forest Green", "hexPreview": "#2B4A35", "pricePremium": 0},
    {"name": "Limestone", "hexPreview": "#C7C0AF", "pricePremium": 0},
    {"name": "Storm Blue", "hexPreview": "#28455E", "pricePremium": 1750},
    {"name": "Compass Yellow", "hexPreview": "#D8B73B", "pricePremium": 2500},
]
TRUCK_COLORS = [
    {"name": "Iconic Silver", "hexPreview": "#B5B9BB", "pricePremium": 0},
    {"name": "Antimatter Blue", "hexPreview": "#1F3B66", "pricePremium": 0},
    {"name": "Agate Black", "hexPreview": "#0E0F12", "pricePremium": 595},
    {"name": "Rapid Red", "hexPreview": "#8E1B1B", "pricePremium": 595},
    {"name": "Atlas Blue", "hexPreview": "#3C6AA8", "pricePremium": 595},
]
LUCID_COLORS = [
    {"name": "Stellar White", "hexPreview": "#EBEBEC", "pricePremium": 0},
    {"name": "Cosmos Silver", "hexPreview": "#A8AAAD", "pricePremium": 0},
    {"name": "Infinite Black", "hexPreview": "#000000", "pricePremium": 1000},
    {"name": "Quantum Grey", "hexPreview": "#5B5F65", "pricePremium": 1000},
    {"name": "Zenith Red", "hexPreview": "#7A1313", "pricePremium": 1500},
]


def colors_for(make: str) -> list[dict]:
    m = make.lower()
    if m == "tesla":
        return TESLA_COLORS
    if m == "rivian":
        return RIVIAN_COLORS
    if m == "lucid":
        return LUCID_COLORS
    if m in ("ford", "chevrolet"):
        return TRUCK_COLORS
    return NEUTRAL_COLORS


# ─── Vehicle data ────────────────────────────────────────────────────────────
# Each entry contains the manufacturer-specific facts: trims, specs, depreciation,
# maintenance, insurance, federal credit eligibility, manufacturer URL, image URLs.
# Lease offer math (MF / residual / monthly) is sourced from public manufacturer
# advertised programs and LeaseHackr forum snapshots — directionally accurate
# enough for the calculator to demonstrate realistic outputs.

VEHICLES = [
    {
        "id": "tesla-model3-2025",
        "make": "Tesla", "model": "Model 3", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.tesla.com/model3",
        "trims": [
            {"name": "RWD", "msrp": 38990, "drivetrain": "RWD", "horsepower": 208, "range": 272,
             "lease": {"monthly": 329, "term": 36, "miles": 10000, "due": 2999, "mf": 0.00125, "residual": 52}},
            {"name": "Long Range AWD", "msrp": 45990, "drivetrain": "AWD", "horsepower": 394, "range": 363,
             "lease": {"monthly": 429, "term": 36, "miles": 10000, "due": 3999, "mf": 0.00175, "residual": 50}},
            {"name": "Performance AWD", "msrp": 54990, "drivetrain": "AWD", "horsepower": 510, "range": 296,
             "lease": {"monthly": 559, "term": 36, "miles": 10000, "due": 4999, "mf": 0.00185, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 57.5, "milesPerKwh": 4.7, "zeroToSixty": 5.8, "topSpeed": 125,
                        "torqueLbFt": 260, "seatingCapacity": 5, "cargoVolumeCuFt": 23.0, "frunkVolumeCuFt": 2.8,
                        "towingCapacityLbs": 0, "groundClearanceIn": 5.5, "weightLbs": 4048,
                        "chargingSpeedDcFastKw": 170, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 575,
        "depreciation": {"y1": 22, "y2": 33, "y3": 41, "y5": 52},
        "insurance": [1550, 2150, 3000],
        "priceHistory": [(2023, 1, 43990), (2024, 1, 40240), (2024, 10, 38990), (2025, 4, 38990)],
    },
    {
        "id": "tesla-modely-2025",
        "make": "Tesla", "model": "Model Y", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.tesla.com/modely",
        "trims": [
            {"name": "Long Range RWD", "msrp": 43990, "drivetrain": "RWD", "horsepower": 295, "range": 320,
             "lease": {"monthly": 399, "term": 36, "miles": 10000, "due": 3999, "mf": 0.00145, "residual": 53}},
            {"name": "Long Range AWD", "msrp": 48990, "drivetrain": "AWD", "horsepower": 384, "range": 310,
             "lease": {"monthly": 469, "term": 36, "miles": 10000, "due": 4499, "mf": 0.00175, "residual": 51}},
            {"name": "Performance AWD", "msrp": 53490, "drivetrain": "AWD", "horsepower": 456, "range": 285,
             "lease": {"monthly": 599, "term": 36, "miles": 10000, "due": 4999, "mf": 0.00195, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 75, "milesPerKwh": 4.1, "zeroToSixty": 4.8, "topSpeed": 135,
                        "torqueLbFt": 376, "seatingCapacity": 5, "cargoVolumeCuFt": 76.2, "frunkVolumeCuFt": 4.1,
                        "towingCapacityLbs": 3500, "groundClearanceIn": 6.6, "weightLbs": 4416,
                        "chargingSpeedDcFastKw": 250, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 120000},
        "maintenance": 590,
        "depreciation": {"y1": 21, "y2": 32, "y3": 40, "y5": 51},
        "insurance": [1620, 2240, 3150],
        "priceHistory": [(2023, 1, 65990), (2023, 7, 50490), (2024, 1, 43990), (2025, 1, 43990)],
    },
    {
        "id": "tesla-models-2025",
        "make": "Tesla", "model": "Model S", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.tesla.com/models",
        "trims": [
            {"name": "Long Range AWD", "msrp": 74990, "drivetrain": "AWD", "horsepower": 670, "range": 405,
             "lease": {"monthly": 849, "term": 36, "miles": 10000, "due": 7499, "mf": 0.00210, "residual": 50}},
            {"name": "Plaid AWD", "msrp": 94990, "drivetrain": "AWD", "horsepower": 1020, "range": 359,
             "lease": {"monthly": 1149, "term": 36, "miles": 10000, "due": 9499, "mf": 0.00235, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 100, "milesPerKwh": 3.9, "zeroToSixty": 3.1, "topSpeed": 149,
                        "torqueLbFt": 723, "seatingCapacity": 5, "cargoVolumeCuFt": 28.4, "frunkVolumeCuFt": 3.1,
                        "towingCapacityLbs": 0, "groundClearanceIn": 4.6, "weightLbs": 4561,
                        "chargingSpeedDcFastKw": 250, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 150000},
        "maintenance": 720,
        "depreciation": {"y1": 26, "y2": 39, "y3": 48, "y5": 60},
        "insurance": [2100, 2850, 4200],
        "priceHistory": [(2023, 1, 94990), (2024, 1, 74990), (2025, 1, 74990)],
    },
    {
        "id": "tesla-modelx-2025",
        "make": "Tesla", "model": "Model X", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.tesla.com/modelx",
        "trims": [
            {"name": "Long Range AWD", "msrp": 79990, "drivetrain": "AWD", "horsepower": 670, "range": 335,
             "lease": {"monthly": 949, "term": 36, "miles": 10000, "due": 7999, "mf": 0.00220, "residual": 50}},
            {"name": "Plaid AWD", "msrp": 99990, "drivetrain": "AWD", "horsepower": 1020, "range": 326,
             "lease": {"monthly": 1249, "term": 36, "miles": 10000, "due": 9999, "mf": 0.00240, "residual": 47}},
        ],
        "specs_base": {"batteryKwh": 100, "milesPerKwh": 3.2, "zeroToSixty": 3.8, "topSpeed": 149,
                        "torqueLbFt": 713, "seatingCapacity": 7, "cargoVolumeCuFt": 88.1, "frunkVolumeCuFt": 5.0,
                        "towingCapacityLbs": 5000, "groundClearanceIn": 6.6, "weightLbs": 5390,
                        "chargingSpeedDcFastKw": 250, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 150000},
        "maintenance": 780,
        "depreciation": {"y1": 27, "y2": 40, "y3": 49, "y5": 61},
        "insurance": [2200, 2950, 4350],
        "priceHistory": [(2023, 1, 104990), (2024, 1, 79990), (2025, 1, 79990)],
    },
    {
        "id": "tesla-cybertruck-2025",
        "make": "Tesla", "model": "Cybertruck", "year": 2025,
        "category": "truck", "bodyStyle": "truck",
        "manufacturerUrl": "https://www.tesla.com/cybertruck",
        "trims": [
            {"name": "Long Range RWD", "msrp": 69990, "drivetrain": "RWD", "horsepower": 315, "range": 340,
             "lease": {"monthly": 779, "term": 36, "miles": 10000, "due": 7999, "mf": 0.00210, "residual": 51}},
            {"name": "All-Wheel Drive", "msrp": 79990, "drivetrain": "AWD", "horsepower": 600, "range": 325,
             "lease": {"monthly": 899, "term": 36, "miles": 10000, "due": 8999, "mf": 0.00220, "residual": 50}},
            {"name": "Cyberbeast", "msrp": 99990, "drivetrain": "AWD", "horsepower": 845, "range": 320,
             "lease": {"monthly": 1199, "term": 36, "miles": 10000, "due": 9999, "mf": 0.00240, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 123, "milesPerKwh": 2.5, "zeroToSixty": 4.1, "topSpeed": 130,
                        "torqueLbFt": 7435, "seatingCapacity": 5, "cargoVolumeCuFt": 67.1, "frunkVolumeCuFt": 7.1,
                        "towingCapacityLbs": 11000, "groundClearanceIn": 16.0, "weightLbs": 6843,
                        "chargingSpeedDcFastKw": 250, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 150000},
        "maintenance": 690,
        "depreciation": {"y1": 25, "y2": 38, "y3": 46, "y5": 58},
        "insurance": [2300, 3100, 4500],
        "priceHistory": [(2023, 11, 99990), (2024, 6, 79990), (2025, 1, 69990)],
    },
    {
        "id": "hyundai-ioniq-5-2025",
        "make": "Hyundai", "model": "IONIQ 5", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-5",
        "trims": [
            {"name": "SE Standard Range RWD", "msrp": 41450, "drivetrain": "RWD", "horsepower": 168, "range": 240,
             "lease": {"monthly": 339, "term": 36, "miles": 10000, "due": 3999, "mf": 0.00112, "residual": 55,
                        "subventioned": True}},
            {"name": "SEL AWD", "msrp": 47450, "drivetrain": "AWD", "horsepower": 320, "range": 290,
             "lease": {"monthly": 419, "term": 36, "miles": 10000, "due": 3999, "mf": 0.00125, "residual": 53,
                        "subventioned": True}},
            {"name": "Limited AWD", "msrp": 56950, "drivetrain": "AWD", "horsepower": 320, "range": 269,
             "lease": {"monthly": 549, "term": 36, "miles": 10000, "due": 4999, "mf": 0.00145, "residual": 51}},
            {"name": "N AWD", "msrp": 66200, "drivetrain": "AWD", "horsepower": 641, "range": 221,
             "lease": {"monthly": 749, "term": 36, "miles": 10000, "due": 5999, "mf": 0.00185, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 84, "milesPerKwh": 3.7, "zeroToSixty": 5.1, "topSpeed": 115,
                        "torqueLbFt": 446, "seatingCapacity": 5, "cargoVolumeCuFt": 59.3, "frunkVolumeCuFt": 0.85,
                        "towingCapacityLbs": 2300, "groundClearanceIn": 6.1, "weightLbs": 4663,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 11, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 5, "batteryWarrantyYears": 10,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 540,
        "depreciation": {"y1": 28, "y2": 40, "y3": 48, "y5": 58},
        "insurance": [1480, 2030, 2900],
        "priceHistory": [(2023, 1, 41450), (2024, 1, 41800), (2025, 1, 41450)],
    },
    {
        "id": "hyundai-ioniq-6-2025",
        "make": "Hyundai", "model": "IONIQ 6", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-6",
        "trims": [
            {"name": "SE Standard Range RWD", "msrp": 38615, "drivetrain": "RWD", "horsepower": 149, "range": 240,
             "lease": {"monthly": 309, "term": 36, "miles": 10000, "due": 3499, "mf": 0.00098, "residual": 56,
                        "subventioned": True}},
            {"name": "SE Long Range RWD", "msrp": 42715, "drivetrain": "RWD", "horsepower": 225, "range": 361,
             "lease": {"monthly": 349, "term": 36, "miles": 10000, "due": 3699, "mf": 0.00110, "residual": 54,
                        "subventioned": True}},
            {"name": "Limited AWD", "msrp": 53715, "drivetrain": "AWD", "horsepower": 320, "range": 270,
             "lease": {"monthly": 489, "term": 36, "miles": 10000, "due": 4499, "mf": 0.00135, "residual": 51}},
        ],
        "specs_base": {"batteryKwh": 77.4, "milesPerKwh": 5.1, "zeroToSixty": 5.1, "topSpeed": 115,
                        "torqueLbFt": 446, "seatingCapacity": 5, "cargoVolumeCuFt": 11.2, "frunkVolumeCuFt": 0.5,
                        "towingCapacityLbs": 0, "groundClearanceIn": 5.3, "weightLbs": 4407,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 11, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 5, "batteryWarrantyYears": 10,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 525,
        "depreciation": {"y1": 30, "y2": 42, "y3": 51, "y5": 61},
        "insurance": [1420, 1960, 2780],
        "priceHistory": [(2023, 1, 41600), (2024, 1, 38615), (2025, 1, 38615)],
    },
    {
        "id": "hyundai-ioniq-9-2025",
        "make": "Hyundai", "model": "IONIQ 9", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.hyundaiusa.com/us/en/vehicles/ioniq-9",
        "trims": [
            {"name": "S RWD", "msrp": 68490, "drivetrain": "RWD", "horsepower": 215, "range": 335,
             "lease": {"monthly": 619, "term": 36, "miles": 10000, "due": 5499, "mf": 0.00150, "residual": 53}},
            {"name": "SE AWD", "msrp": 73490, "drivetrain": "AWD", "horsepower": 303, "range": 320,
             "lease": {"monthly": 679, "term": 36, "miles": 10000, "due": 5999, "mf": 0.00160, "residual": 51}},
            {"name": "Calligraphy AWD", "msrp": 78490, "drivetrain": "AWD", "horsepower": 422, "range": 311,
             "lease": {"monthly": 739, "term": 36, "miles": 10000, "due": 6499, "mf": 0.00175, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 110.3, "milesPerKwh": 3.1, "zeroToSixty": 6.2, "topSpeed": 124,
                        "torqueLbFt": 516, "seatingCapacity": 7, "cargoVolumeCuFt": 88.0, "frunkVolumeCuFt": 3.0,
                        "towingCapacityLbs": 5000, "groundClearanceIn": 6.8, "weightLbs": 5723,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 11, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 5, "batteryWarrantyYears": 10,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 610,
        "depreciation": {"y1": 28, "y2": 41, "y3": 50, "y5": 60},
        "insurance": [1840, 2480, 3540],
        "priceHistory": [(2024, 11, 68490), (2025, 1, 68490)],
    },
    {
        "id": "kia-ev6-2025",
        "make": "Kia", "model": "EV6", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.kia.com/us/en/ev6",
        "trims": [
            {"name": "Light RWD", "msrp": 42600, "drivetrain": "RWD", "horsepower": 167, "range": 232,
             "lease": {"monthly": 339, "term": 36, "miles": 10000, "due": 3699, "mf": 0.00108, "residual": 55,
                        "subventioned": True}},
            {"name": "Wind AWD", "msrp": 50900, "drivetrain": "AWD", "horsepower": 320, "range": 282,
             "lease": {"monthly": 449, "term": 36, "miles": 10000, "due": 4199, "mf": 0.00135, "residual": 52}},
            {"name": "GT-Line AWD", "msrp": 55900, "drivetrain": "AWD", "horsepower": 320, "range": 252,
             "lease": {"monthly": 519, "term": 36, "miles": 10000, "due": 4699, "mf": 0.00145, "residual": 50}},
            {"name": "GT AWD", "msrp": 63800, "drivetrain": "AWD", "horsepower": 641, "range": 218,
             "lease": {"monthly": 729, "term": 36, "miles": 10000, "due": 5999, "mf": 0.00195, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 84, "milesPerKwh": 3.9, "zeroToSixty": 5.0, "topSpeed": 117,
                        "torqueLbFt": 446, "seatingCapacity": 5, "cargoVolumeCuFt": 50.2, "frunkVolumeCuFt": 0.85,
                        "towingCapacityLbs": 2300, "groundClearanceIn": 6.1, "weightLbs": 4502,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 11, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 5, "batteryWarrantyYears": 10,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 545,
        "depreciation": {"y1": 28, "y2": 41, "y3": 49, "y5": 59},
        "insurance": [1510, 2070, 2950],
        "priceHistory": [(2023, 1, 48700), (2024, 1, 42600), (2025, 1, 42600)],
    },
    {
        "id": "kia-ev9-2025",
        "make": "Kia", "model": "EV9", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.kia.com/us/en/ev9",
        "trims": [
            {"name": "Light RWD", "msrp": 54900, "drivetrain": "RWD", "horsepower": 215, "range": 304,
             "lease": {"monthly": 489, "term": 36, "miles": 10000, "due": 4999, "mf": 0.00135, "residual": 54,
                        "subventioned": True}},
            {"name": "Wind AWD", "msrp": 63900, "drivetrain": "AWD", "horsepower": 379, "range": 280,
             "lease": {"monthly": 569, "term": 36, "miles": 10000, "due": 5499, "mf": 0.00150, "residual": 52}},
            {"name": "Land AWD", "msrp": 71900, "drivetrain": "AWD", "horsepower": 379, "range": 270,
             "lease": {"monthly": 649, "term": 36, "miles": 10000, "due": 5999, "mf": 0.00165, "residual": 50}},
            {"name": "GT-Line AWD", "msrp": 75900, "drivetrain": "AWD", "horsepower": 379, "range": 260,
             "lease": {"monthly": 729, "term": 36, "miles": 10000, "due": 6499, "mf": 0.00180, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 99.8, "milesPerKwh": 3.1, "zeroToSixty": 4.5, "topSpeed": 124,
                        "torqueLbFt": 516, "seatingCapacity": 7, "cargoVolumeCuFt": 81.7, "frunkVolumeCuFt": 1.7,
                        "towingCapacityLbs": 5000, "groundClearanceIn": 7.8, "weightLbs": 5687,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 11, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 5, "batteryWarrantyYears": 10,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 605,
        "depreciation": {"y1": 26, "y2": 39, "y3": 47, "y5": 57},
        "insurance": [1700, 2310, 3290],
        "priceHistory": [(2024, 1, 54900), (2025, 1, 54900)],
    },
    {
        "id": "ford-mustang-mach-e-2025",
        "make": "Ford", "model": "Mustang Mach-E", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.ford.com/suvs/mach-e",
        "trims": [
            {"name": "Select RWD", "msrp": 42995, "drivetrain": "RWD", "horsepower": 266, "range": 250,
             "lease": {"monthly": 339, "term": 36, "miles": 10500, "due": 3899, "mf": 0.00075, "residual": 53,
                        "subventioned": True}},
            {"name": "Premium AWD ER", "msrp": 50095, "drivetrain": "AWD", "horsepower": 346, "range": 312,
             "lease": {"monthly": 449, "term": 36, "miles": 10500, "due": 4499, "mf": 0.00098, "residual": 51,
                        "subventioned": True}},
            {"name": "GT AWD", "msrp": 56995, "drivetrain": "AWD", "horsepower": 480, "range": 270,
             "lease": {"monthly": 569, "term": 36, "miles": 10500, "due": 4999, "mf": 0.00135, "residual": 49}},
            {"name": "Rally AWD", "msrp": 59995, "drivetrain": "AWD", "horsepower": 480, "range": 265,
             "lease": {"monthly": 629, "term": 36, "miles": 10500, "due": 5299, "mf": 0.00145, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 91, "milesPerKwh": 3.5, "zeroToSixty": 4.8, "topSpeed": 124,
                        "torqueLbFt": 428, "seatingCapacity": 5, "cargoVolumeCuFt": 59.7, "frunkVolumeCuFt": 4.7,
                        "towingCapacityLbs": 1500, "groundClearanceIn": 5.7, "weightLbs": 4890,
                        "chargingSpeedDcFastKw": 150, "chargingSpeedL2Kw": 10.5, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 600,
        "depreciation": {"y1": 31, "y2": 43, "y3": 51, "y5": 62},
        "insurance": [1590, 2180, 3120],
        "priceHistory": [(2023, 1, 45995), (2024, 4, 39995), (2024, 10, 42995), (2025, 1, 42995)],
    },
    {
        "id": "ford-f-150-lightning-2025",
        "make": "Ford", "model": "F-150 Lightning", "year": 2025,
        "category": "truck", "bodyStyle": "truck",
        "manufacturerUrl": "https://www.ford.com/trucks/f150/f150-lightning",
        "trims": [
            {"name": "Pro", "msrp": 49995, "drivetrain": "AWD", "horsepower": 452, "range": 240,
             "lease": {"monthly": 429, "term": 36, "miles": 10500, "due": 4999, "mf": 0.00098, "residual": 50,
                        "subventioned": True}},
            {"name": "XLT", "msrp": 64995, "drivetrain": "AWD", "horsepower": 452, "range": 240,
             "lease": {"monthly": 549, "term": 36, "miles": 10500, "due": 5499, "mf": 0.00125, "residual": 48}},
            {"name": "Lariat ER", "msrp": 77495, "drivetrain": "AWD", "horsepower": 580, "range": 320,
             "lease": {"monthly": 749, "term": 36, "miles": 10500, "due": 6499, "mf": 0.00145, "residual": 46}},
            {"name": "Platinum ER", "msrp": 87995, "drivetrain": "AWD", "horsepower": 580, "range": 300,
             "lease": {"monthly": 869, "term": 36, "miles": 10500, "due": 7299, "mf": 0.00155, "residual": 45}},
        ],
        "specs_base": {"batteryKwh": 131, "milesPerKwh": 2.4, "zeroToSixty": 4.0, "topSpeed": 110,
                        "torqueLbFt": 775, "seatingCapacity": 5, "cargoVolumeCuFt": 52.8, "frunkVolumeCuFt": 14.1,
                        "towingCapacityLbs": 10000, "groundClearanceIn": 9.4, "weightLbs": 6855,
                        "chargingSpeedDcFastKw": 150, "chargingSpeedL2Kw": 19.2, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 720,
        "depreciation": {"y1": 30, "y2": 42, "y3": 50, "y5": 60},
        "insurance": [1820, 2470, 3540],
        "priceHistory": [(2023, 1, 56995), (2024, 1, 49995), (2024, 12, 49995)],
    },
    {
        "id": "ford-e-transit-2025",
        "make": "Ford", "model": "E-Transit", "year": 2025,
        "category": "van", "bodyStyle": "van",
        "manufacturerUrl": "https://www.ford.com/commercial-trucks/e-transit",
        "trims": [
            {"name": "Cargo Van Low Roof", "msrp": 51995, "drivetrain": "RWD", "horsepower": 266, "range": 126,
             "lease": {"monthly": 539, "term": 36, "miles": 12000, "due": 4499, "mf": 0.00135, "residual": 46}},
            {"name": "Cargo Van Medium Roof ER", "msrp": 56995, "drivetrain": "RWD", "horsepower": 266, "range": 159,
             "lease": {"monthly": 599, "term": 36, "miles": 12000, "due": 4999, "mf": 0.00145, "residual": 44}},
        ],
        "specs_base": {"batteryKwh": 89, "milesPerKwh": 2.1, "zeroToSixty": 8.5, "topSpeed": 75,
                        "torqueLbFt": 317, "seatingCapacity": 2, "cargoVolumeCuFt": 487.3, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 4500, "groundClearanceIn": 6.5, "weightLbs": 7385,
                        "chargingSpeedDcFastKw": 115, "chargingSpeedL2Kw": 11.3, "chargingPort": "CCS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 580,
        "depreciation": {"y1": 32, "y2": 45, "y3": 53, "y5": 63},
        "insurance": [1620, 2200, 3140],
        "priceHistory": [(2023, 1, 53995), (2024, 1, 49995), (2025, 1, 51995)],
    },
    {
        "id": "chevrolet-equinox-ev-2025",
        "make": "Chevrolet", "model": "Equinox EV", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.chevrolet.com/electric/equinox-ev",
        "trims": [
            {"name": "1LT FWD", "msrp": 34995, "drivetrain": "FWD", "horsepower": 213, "range": 319,
             "lease": {"monthly": 299, "term": 36, "miles": 10000, "due": 3999, "mf": 0.00085, "residual": 55,
                        "subventioned": True}},
            {"name": "2LT AWD", "msrp": 41995, "drivetrain": "AWD", "horsepower": 288, "range": 285,
             "lease": {"monthly": 379, "term": 36, "miles": 10000, "due": 4299, "mf": 0.00112, "residual": 52}},
            {"name": "RS AWD", "msrp": 46995, "drivetrain": "AWD", "horsepower": 288, "range": 285,
             "lease": {"monthly": 449, "term": 36, "miles": 10000, "due": 4599, "mf": 0.00125, "residual": 51}},
        ],
        "specs_base": {"batteryKwh": 85, "milesPerKwh": 3.8, "zeroToSixty": 5.9, "topSpeed": 110,
                        "torqueLbFt": 333, "seatingCapacity": 5, "cargoVolumeCuFt": 57.2, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 1500, "groundClearanceIn": 7.9, "weightLbs": 5572,
                        "chargingSpeedDcFastKw": 150, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 560,
        "depreciation": {"y1": 30, "y2": 43, "y3": 51, "y5": 61},
        "insurance": [1450, 1980, 2820],
        "priceHistory": [(2024, 1, 41295), (2024, 9, 34995), (2025, 1, 34995)],
    },
    {
        "id": "chevrolet-blazer-ev-2025",
        "make": "Chevrolet", "model": "Blazer EV", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.chevrolet.com/electric/blazer-ev",
        "trims": [
            {"name": "LT FWD", "msrp": 42995, "drivetrain": "FWD", "horsepower": 220, "range": 324,
             "lease": {"monthly": 389, "term": 36, "miles": 10000, "due": 4099, "mf": 0.00098, "residual": 53}},
            {"name": "RS RWD", "msrp": 47595, "drivetrain": "RWD", "horsepower": 340, "range": 334,
             "lease": {"monthly": 449, "term": 36, "miles": 10000, "due": 4399, "mf": 0.00112, "residual": 51}},
            {"name": "RS AWD", "msrp": 53895, "drivetrain": "AWD", "horsepower": 288, "range": 281,
             "lease": {"monthly": 519, "term": 36, "miles": 10000, "due": 4699, "mf": 0.00135, "residual": 50}},
            {"name": "SS AWD", "msrp": 60895, "drivetrain": "AWD", "horsepower": 615, "range": 303,
             "lease": {"monthly": 639, "term": 36, "miles": 10000, "due": 5299, "mf": 0.00155, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 102, "milesPerKwh": 3.5, "zeroToSixty": 6.0, "topSpeed": 122,
                        "torqueLbFt": 333, "seatingCapacity": 5, "cargoVolumeCuFt": 59.1, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 1500, "groundClearanceIn": 8.0, "weightLbs": 5700,
                        "chargingSpeedDcFastKw": 190, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 595,
        "depreciation": {"y1": 32, "y2": 44, "y3": 52, "y5": 62},
        "insurance": [1560, 2110, 3010],
        "priceHistory": [(2024, 1, 56715), (2024, 9, 50195), (2025, 1, 42995)],
    },
    {
        "id": "chevrolet-silverado-ev-2025",
        "make": "Chevrolet", "model": "Silverado EV", "year": 2025,
        "category": "truck", "bodyStyle": "truck",
        "manufacturerUrl": "https://www.chevrolet.com/electric/silverado-ev",
        "trims": [
            {"name": "Work Truck", "msrp": 41995, "drivetrain": "AWD", "horsepower": 510, "range": 393,
             "lease": {"monthly": 449, "term": 36, "miles": 10000, "due": 4799, "mf": 0.00125, "residual": 48}},
            {"name": "LT", "msrp": 73095, "drivetrain": "AWD", "horsepower": 645, "range": 408,
             "lease": {"monthly": 779, "term": 36, "miles": 10000, "due": 6499, "mf": 0.00148, "residual": 46}},
            {"name": "RST", "msrp": 96495, "drivetrain": "AWD", "horsepower": 754, "range": 440,
             "lease": {"monthly": 999, "term": 36, "miles": 10000, "due": 8499, "mf": 0.00165, "residual": 44}},
        ],
        "specs_base": {"batteryKwh": 205, "milesPerKwh": 2.2, "zeroToSixty": 4.5, "topSpeed": 110,
                        "torqueLbFt": 785, "seatingCapacity": 5, "cargoVolumeCuFt": 71.1, "frunkVolumeCuFt": 10.7,
                        "towingCapacityLbs": 10000, "groundClearanceIn": 11.0, "weightLbs": 8700,
                        "chargingSpeedDcFastKw": 350, "chargingSpeedL2Kw": 19.2, "chargingPort": "NACS",
                        "autopilot": False, "warrantyYears": 3, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 740,
        "depreciation": {"y1": 30, "y2": 42, "y3": 50, "y5": 60},
        "insurance": [1900, 2580, 3690],
        "priceHistory": [(2024, 1, 73095), (2024, 11, 41995), (2025, 1, 41995)],
    },
    {
        "id": "rivian-r1t-2025",
        "make": "Rivian", "model": "R1T", "year": 2025,
        "category": "truck", "bodyStyle": "truck",
        "manufacturerUrl": "https://rivian.com/r1t",
        "trims": [
            {"name": "Dual Standard", "msrp": 69900, "drivetrain": "AWD", "horsepower": 533, "range": 270,
             "lease": {"monthly": 819, "term": 36, "miles": 10000, "due": 6999, "mf": 0.00210, "residual": 50}},
            {"name": "Dual Large", "msrp": 75900, "drivetrain": "AWD", "horsepower": 533, "range": 329,
             "lease": {"monthly": 879, "term": 36, "miles": 10000, "due": 7499, "mf": 0.00215, "residual": 48}},
            {"name": "Tri Max", "msrp": 99900, "drivetrain": "AWD", "horsepower": 850, "range": 371,
             "lease": {"monthly": 1149, "term": 36, "miles": 10000, "due": 8999, "mf": 0.00235, "residual": 47}},
            {"name": "Quad Max", "msrp": 115900, "drivetrain": "AWD", "horsepower": 1025, "range": 374,
             "lease": {"monthly": 1349, "term": 36, "miles": 10000, "due": 9999, "mf": 0.00250, "residual": 46}},
        ],
        "specs_base": {"batteryKwh": 141.5, "milesPerKwh": 2.8, "zeroToSixty": 3.0, "topSpeed": 125,
                        "torqueLbFt": 1198, "seatingCapacity": 5, "cargoVolumeCuFt": 67.6, "frunkVolumeCuFt": 11.6,
                        "towingCapacityLbs": 11000, "groundClearanceIn": 14.4, "weightLbs": 7148,
                        "chargingSpeedDcFastKw": 220, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 5, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 175000},
        "maintenance": 695,
        "depreciation": {"y1": 26, "y2": 38, "y3": 46, "y5": 57},
        "insurance": [2050, 2780, 3970],
        "priceHistory": [(2023, 1, 73000), (2024, 6, 69900), (2025, 1, 69900)],
    },
    {
        "id": "rivian-r1s-2025",
        "make": "Rivian", "model": "R1S", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://rivian.com/r1s",
        "trims": [
            {"name": "Dual Standard", "msrp": 75900, "drivetrain": "AWD", "horsepower": 533, "range": 270,
             "lease": {"monthly": 879, "term": 36, "miles": 10000, "due": 7499, "mf": 0.00212, "residual": 50}},
            {"name": "Dual Large", "msrp": 81900, "drivetrain": "AWD", "horsepower": 533, "range": 329,
             "lease": {"monthly": 949, "term": 36, "miles": 10000, "due": 7999, "mf": 0.00218, "residual": 48}},
            {"name": "Tri Max", "msrp": 105900, "drivetrain": "AWD", "horsepower": 850, "range": 371,
             "lease": {"monthly": 1239, "term": 36, "miles": 10000, "due": 9499, "mf": 0.00235, "residual": 47}},
            {"name": "Quad Max", "msrp": 121900, "drivetrain": "AWD", "horsepower": 1025, "range": 380,
             "lease": {"monthly": 1429, "term": 36, "miles": 10000, "due": 9999, "mf": 0.00250, "residual": 46}},
        ],
        "specs_base": {"batteryKwh": 141.5, "milesPerKwh": 2.7, "zeroToSixty": 3.0, "topSpeed": 125,
                        "torqueLbFt": 1198, "seatingCapacity": 7, "cargoVolumeCuFt": 104.7, "frunkVolumeCuFt": 11.6,
                        "towingCapacityLbs": 7700, "groundClearanceIn": 14.4, "weightLbs": 7174,
                        "chargingSpeedDcFastKw": 220, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 5, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 175000},
        "maintenance": 710,
        "depreciation": {"y1": 25, "y2": 38, "y3": 46, "y5": 56},
        "insurance": [2100, 2860, 4080],
        "priceHistory": [(2023, 1, 78000), (2024, 6, 75900), (2025, 1, 75900)],
    },
    {
        "id": "rivian-r2-2025",
        "make": "Rivian", "model": "R2", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://rivian.com/r2",
        "comingSoon": True,
        "expectedReleaseYear": 2026,
        "trims": [
            {"name": "Standard Pack AWD", "msrp": 45000, "drivetrain": "AWD", "horsepower": 350, "range": 300,
             "lease": None},
            {"name": "Large Pack AWD", "msrp": 51000, "drivetrain": "AWD", "horsepower": 450, "range": 330,
             "lease": None},
        ],
        "specs_base": {"batteryKwh": 95, "milesPerKwh": 3.5, "zeroToSixty": 4.5, "topSpeed": 110,
                        "torqueLbFt": 555, "seatingCapacity": 5, "cargoVolumeCuFt": 60, "frunkVolumeCuFt": 5.5,
                        "towingCapacityLbs": 3500, "groundClearanceIn": 9.8, "weightLbs": 5600,
                        "chargingSpeedDcFastKw": 200, "chargingSpeedL2Kw": 11.5, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 5, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 175000},
        "maintenance": 575,
        "depreciation": {"y1": 25, "y2": 37, "y3": 45, "y5": 56},
        "insurance": [1690, 2300, 3280],
        "priceHistory": [(2024, 3, 45000), (2025, 1, 45000)],
    },
    {
        "id": "bmw-i4-2025",
        "make": "BMW", "model": "i4", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.bmwusa.com/vehicles/bmwi/i4.html",
        "trims": [
            {"name": "eDrive35", "msrp": 52200, "drivetrain": "RWD", "horsepower": 282, "range": 256,
             "lease": {"monthly": 499, "term": 36, "miles": 10000, "due": 5495, "mf": 0.00139, "residual": 56,
                        "subventioned": True}},
            {"name": "eDrive40", "msrp": 57900, "drivetrain": "RWD", "horsepower": 335, "range": 301,
             "lease": {"monthly": 569, "term": 36, "miles": 10000, "due": 5895, "mf": 0.00145, "residual": 55,
                        "subventioned": True}},
            {"name": "xDrive40", "msrp": 60200, "drivetrain": "AWD", "horsepower": 396, "range": 287,
             "lease": {"monthly": 609, "term": 36, "miles": 10000, "due": 5995, "mf": 0.00155, "residual": 54}},
            {"name": "M50 xDrive", "msrp": 72300, "drivetrain": "AWD", "horsepower": 536, "range": 269,
             "lease": {"monthly": 779, "term": 36, "miles": 10000, "due": 6995, "mf": 0.00175, "residual": 52}},
        ],
        "specs_base": {"batteryKwh": 81, "milesPerKwh": 3.7, "zeroToSixty": 5.5, "topSpeed": 140,
                        "torqueLbFt": 317, "seatingCapacity": 5, "cargoVolumeCuFt": 17.0, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 0, "groundClearanceIn": 5.4, "weightLbs": 4680,
                        "chargingSpeedDcFastKw": 200, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 695,
        "depreciation": {"y1": 30, "y2": 43, "y3": 52, "y5": 63},
        "insurance": [1840, 2510, 3590],
        "priceHistory": [(2023, 1, 56395), (2024, 1, 52200), (2025, 1, 52200)],
    },
    {
        "id": "bmw-i5-2025",
        "make": "BMW", "model": "i5", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.bmwusa.com/vehicles/bmwi/i5.html",
        "trims": [
            {"name": "eDrive40", "msrp": 67900, "drivetrain": "RWD", "horsepower": 335, "range": 295,
             "lease": {"monthly": 679, "term": 36, "miles": 10000, "due": 6395, "mf": 0.00155, "residual": 55}},
            {"name": "xDrive40", "msrp": 70300, "drivetrain": "AWD", "horsepower": 388, "range": 256,
             "lease": {"monthly": 729, "term": 36, "miles": 10000, "due": 6695, "mf": 0.00165, "residual": 53}},
            {"name": "M60 xDrive", "msrp": 84100, "drivetrain": "AWD", "horsepower": 593, "range": 256,
             "lease": {"monthly": 949, "term": 36, "miles": 10000, "due": 7995, "mf": 0.00185, "residual": 51}},
        ],
        "specs_base": {"batteryKwh": 81.2, "milesPerKwh": 3.5, "zeroToSixty": 5.7, "topSpeed": 130,
                        "torqueLbFt": 317, "seatingCapacity": 5, "cargoVolumeCuFt": 17.3, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 0, "groundClearanceIn": 5.5, "weightLbs": 5247,
                        "chargingSpeedDcFastKw": 205, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 730,
        "depreciation": {"y1": 31, "y2": 44, "y3": 53, "y5": 64},
        "insurance": [2010, 2740, 3920],
        "priceHistory": [(2024, 1, 67100), (2025, 1, 67900)],
    },
    {
        "id": "bmw-i7-2025",
        "make": "BMW", "model": "i7", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.bmwusa.com/vehicles/bmwi/i7.html",
        "trims": [
            {"name": "xDrive60", "msrp": 111300, "drivetrain": "AWD", "horsepower": 536, "range": 318,
             "lease": {"monthly": 1349, "term": 36, "miles": 10000, "due": 9995, "mf": 0.00195, "residual": 51}},
            {"name": "M70 xDrive", "msrp": 167700, "drivetrain": "AWD", "horsepower": 650, "range": 285,
             "lease": {"monthly": 1999, "term": 36, "miles": 10000, "due": 12995, "mf": 0.00220, "residual": 47}},
        ],
        "specs_base": {"batteryKwh": 101.7, "milesPerKwh": 3.1, "zeroToSixty": 4.5, "topSpeed": 149,
                        "torqueLbFt": 549, "seatingCapacity": 5, "cargoVolumeCuFt": 17.7, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 0, "groundClearanceIn": 6.0, "weightLbs": 5917,
                        "chargingSpeedDcFastKw": 195, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 990,
        "depreciation": {"y1": 34, "y2": 49, "y3": 58, "y5": 69},
        "insurance": [2580, 3520, 5040],
        "priceHistory": [(2023, 1, 119300), (2024, 1, 105700), (2025, 1, 111300)],
    },
    {
        "id": "bmw-ix-2025",
        "make": "BMW", "model": "iX", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.bmwusa.com/vehicles/bmwi/ix.html",
        "trims": [
            {"name": "xDrive50", "msrp": 87100, "drivetrain": "AWD", "horsepower": 516, "range": 324,
             "lease": {"monthly": 949, "term": 36, "miles": 10000, "due": 7995, "mf": 0.00185, "residual": 53}},
            {"name": "M60", "msrp": 111500, "drivetrain": "AWD", "horsepower": 610, "range": 280,
             "lease": {"monthly": 1249, "term": 36, "miles": 10000, "due": 9995, "mf": 0.00210, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 111.5, "milesPerKwh": 2.9, "zeroToSixty": 4.4, "topSpeed": 124,
                        "torqueLbFt": 564, "seatingCapacity": 5, "cargoVolumeCuFt": 35.5, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 3500, "groundClearanceIn": 8.1, "weightLbs": 5769,
                        "chargingSpeedDcFastKw": 200, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 825,
        "depreciation": {"y1": 32, "y2": 46, "y3": 55, "y5": 66},
        "insurance": [2210, 3010, 4310],
        "priceHistory": [(2023, 1, 84100), (2024, 1, 87250), (2025, 1, 87100)],
    },
    {
        "id": "volkswagen-id4-2025",
        "make": "Volkswagen", "model": "ID.4", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.vw.com/en/models/id-4.html",
        "trims": [
            {"name": "Standard RWD", "msrp": 38995, "drivetrain": "RWD", "horsepower": 201, "range": 206,
             "lease": {"monthly": 299, "term": 36, "miles": 10000, "due": 3499, "mf": 0.00098, "residual": 53,
                        "subventioned": True}},
            {"name": "S RWD", "msrp": 42795, "drivetrain": "RWD", "horsepower": 282, "range": 291,
             "lease": {"monthly": 349, "term": 36, "miles": 10000, "due": 3799, "mf": 0.00112, "residual": 51,
                        "subventioned": True}},
            {"name": "Pro AWD", "msrp": 46795, "drivetrain": "AWD", "horsepower": 335, "range": 275,
             "lease": {"monthly": 409, "term": 36, "miles": 10000, "due": 4099, "mf": 0.00125, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 82, "milesPerKwh": 3.3, "zeroToSixty": 5.4, "topSpeed": 99,
                        "torqueLbFt": 339, "seatingCapacity": 5, "cargoVolumeCuFt": 64.2, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 2700, "groundClearanceIn": 7.6, "weightLbs": 4825,
                        "chargingSpeedDcFastKw": 175, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": False, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 575,
        "depreciation": {"y1": 33, "y2": 46, "y3": 54, "y5": 64},
        "insurance": [1480, 2020, 2880],
        "priceHistory": [(2023, 1, 38995), (2024, 1, 39735), (2025, 1, 38995)],
    },
    {
        "id": "volkswagen-id-buzz-2025",
        "make": "Volkswagen", "model": "ID. Buzz", "year": 2025,
        "category": "van", "bodyStyle": "van",
        "manufacturerUrl": "https://www.vw.com/en/models/id-buzz.html",
        "trims": [
            {"name": "Pro S RWD", "msrp": 59995, "drivetrain": "RWD", "horsepower": 282, "range": 234,
             "lease": {"monthly": 599, "term": 36, "miles": 10000, "due": 5495, "mf": 0.00145, "residual": 53}},
            {"name": "Pro S Plus 1st Edition", "msrp": 65000, "drivetrain": "RWD", "horsepower": 282, "range": 231,
             "lease": {"monthly": 649, "term": 36, "miles": 10000, "due": 5895, "mf": 0.00150, "residual": 51}},
            {"name": "Pro S 4Motion", "msrp": 65000, "drivetrain": "AWD", "horsepower": 335, "range": 231,
             "lease": {"monthly": 679, "term": 36, "miles": 10000, "due": 5895, "mf": 0.00155, "residual": 51}},
        ],
        "specs_base": {"batteryKwh": 91, "milesPerKwh": 2.8, "zeroToSixty": 7.9, "topSpeed": 99,
                        "torqueLbFt": 413, "seatingCapacity": 7, "cargoVolumeCuFt": 145.5, "frunkVolumeCuFt": 0,
                        "towingCapacityLbs": 2700, "groundClearanceIn": 7.0, "weightLbs": 6197,
                        "chargingSpeedDcFastKw": 200, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": False, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 615,
        "depreciation": {"y1": 29, "y2": 41, "y3": 49, "y5": 59},
        "insurance": [1690, 2300, 3290],
        "priceHistory": [(2024, 12, 59995), (2025, 1, 59995)],
    },
    {
        "id": "lucid-air-2025",
        "make": "Lucid", "model": "Air", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://lucidmotors.com/air",
        "trims": [
            {"name": "Pure RWD", "msrp": 69900, "drivetrain": "RWD", "horsepower": 430, "range": 419,
             "lease": {"monthly": 749, "term": 36, "miles": 10000, "due": 6995, "mf": 0.00185, "residual": 52}},
            {"name": "Touring AWD", "msrp": 79900, "drivetrain": "AWD", "horsepower": 620, "range": 411,
             "lease": {"monthly": 879, "term": 36, "miles": 10000, "due": 7995, "mf": 0.00195, "residual": 50}},
            {"name": "Grand Touring", "msrp": 110900, "drivetrain": "AWD", "horsepower": 819, "range": 512,
             "lease": {"monthly": 1199, "term": 36, "miles": 10000, "due": 9995, "mf": 0.00215, "residual": 48}},
            {"name": "Sapphire", "msrp": 249000, "drivetrain": "AWD", "horsepower": 1234, "range": 427,
             "lease": {"monthly": 2799, "term": 36, "miles": 10000, "due": 14995, "mf": 0.00245, "residual": 45}},
        ],
        "specs_base": {"batteryKwh": 118, "milesPerKwh": 5.0, "zeroToSixty": 4.5, "topSpeed": 168,
                        "torqueLbFt": 406, "seatingCapacity": 5, "cargoVolumeCuFt": 22.1, "frunkVolumeCuFt": 9.1,
                        "towingCapacityLbs": 0, "groundClearanceIn": 5.5, "weightLbs": 4564,
                        "chargingSpeedDcFastKw": 300, "chargingSpeedL2Kw": 19.2, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 685,
        "depreciation": {"y1": 33, "y2": 47, "y3": 56, "y5": 67},
        "insurance": [2040, 2780, 3970],
        "priceHistory": [(2023, 1, 87400), (2024, 1, 71400), (2024, 9, 69900), (2025, 1, 69900)],
    },
    {
        "id": "lucid-gravity-2025",
        "make": "Lucid", "model": "Gravity", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://lucidmotors.com/gravity",
        "trims": [
            {"name": "Touring", "msrp": 94900, "drivetrain": "AWD", "horsepower": 620, "range": 440,
             "lease": {"monthly": 1049, "term": 36, "miles": 10000, "due": 8995, "mf": 0.00205, "residual": 51}},
            {"name": "Grand Touring", "msrp": 109900, "drivetrain": "AWD", "horsepower": 828, "range": 450,
             "lease": {"monthly": 1199, "term": 36, "miles": 10000, "due": 9995, "mf": 0.00215, "residual": 49}},
        ],
        "specs_base": {"batteryKwh": 120, "milesPerKwh": 3.7, "zeroToSixty": 3.4, "topSpeed": 155,
                        "torqueLbFt": 686, "seatingCapacity": 7, "cargoVolumeCuFt": 112.0, "frunkVolumeCuFt": 8.0,
                        "towingCapacityLbs": 6000, "groundClearanceIn": 9.0, "weightLbs": 6100,
                        "chargingSpeedDcFastKw": 400, "chargingSpeedL2Kw": 19.2, "chargingPort": "NACS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 720,
        "depreciation": {"y1": 30, "y2": 43, "y3": 51, "y5": 62},
        "insurance": [2180, 2960, 4220],
        "priceHistory": [(2024, 11, 94900), (2025, 1, 94900)],
    },
    {
        "id": "polestar-polestar-2-2025",
        "make": "Polestar", "model": "Polestar 2", "year": 2025,
        "category": "sedan", "bodyStyle": "sedan",
        "manufacturerUrl": "https://www.polestar.com/us/polestar-2",
        "trims": [
            {"name": "Long Range Single Motor", "msrp": 44900, "drivetrain": "RWD", "horsepower": 299, "range": 320,
             "lease": {"monthly": 419, "term": 36, "miles": 10000, "due": 4499, "mf": 0.00135, "residual": 52,
                        "subventioned": True}},
            {"name": "Long Range Dual Motor", "msrp": 49900, "drivetrain": "AWD", "horsepower": 421, "range": 276,
             "lease": {"monthly": 489, "term": 36, "miles": 10000, "due": 4699, "mf": 0.00148, "residual": 50}},
            {"name": "BST Edition 270", "msrp": 64900, "drivetrain": "AWD", "horsepower": 469, "range": 247,
             "lease": {"monthly": 649, "term": 36, "miles": 10000, "due": 5499, "mf": 0.00175, "residual": 47}},
        ],
        "specs_base": {"batteryKwh": 82, "milesPerKwh": 3.7, "zeroToSixty": 4.2, "topSpeed": 127,
                        "torqueLbFt": 546, "seatingCapacity": 5, "cargoVolumeCuFt": 14.3, "frunkVolumeCuFt": 1.3,
                        "towingCapacityLbs": 2000, "groundClearanceIn": 5.9, "weightLbs": 4670,
                        "chargingSpeedDcFastKw": 205, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 625,
        "depreciation": {"y1": 32, "y2": 45, "y3": 54, "y5": 64},
        "insurance": [1650, 2240, 3210],
        "priceHistory": [(2023, 1, 49900), (2024, 1, 49900), (2025, 1, 44900)],
    },
    {
        "id": "polestar-polestar-3-2025",
        "make": "Polestar", "model": "Polestar 3", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.polestar.com/us/polestar-3",
        "trims": [
            {"name": "Long Range Single Motor", "msrp": 73400, "drivetrain": "RWD", "horsepower": 295, "range": 350,
             "lease": {"monthly": 799, "term": 36, "miles": 10000, "due": 6995, "mf": 0.00180, "residual": 50}},
            {"name": "Long Range Dual Motor", "msrp": 79400, "drivetrain": "AWD", "horsepower": 489, "range": 315,
             "lease": {"monthly": 869, "term": 36, "miles": 10000, "due": 7495, "mf": 0.00195, "residual": 49}},
            {"name": "Performance Pack", "msrp": 85400, "drivetrain": "AWD", "horsepower": 517, "range": 279,
             "lease": {"monthly": 939, "term": 36, "miles": 10000, "due": 7995, "mf": 0.00205, "residual": 47}},
        ],
        "specs_base": {"batteryKwh": 111, "milesPerKwh": 2.7, "zeroToSixty": 4.6, "topSpeed": 130,
                        "torqueLbFt": 671, "seatingCapacity": 5, "cargoVolumeCuFt": 32.2, "frunkVolumeCuFt": 1.1,
                        "towingCapacityLbs": 3500, "groundClearanceIn": 8.3, "weightLbs": 5697,
                        "chargingSpeedDcFastKw": 250, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 705,
        "depreciation": {"y1": 31, "y2": 44, "y3": 53, "y5": 64},
        "insurance": [1990, 2710, 3870],
        "priceHistory": [(2024, 1, 83900), (2024, 9, 73400), (2025, 1, 73400)],
    },
    {
        "id": "polestar-polestar-4-2025",
        "make": "Polestar", "model": "Polestar 4", "year": 2025,
        "category": "suv", "bodyStyle": "suv",
        "manufacturerUrl": "https://www.polestar.com/us/polestar-4",
        "trims": [
            {"name": "Long Range Single Motor", "msrp": 56900, "drivetrain": "RWD", "horsepower": 272, "range": 300,
             "lease": {"monthly": 599, "term": 36, "miles": 10000, "due": 5495, "mf": 0.00160, "residual": 51}},
            {"name": "Long Range Dual Motor", "msrp": 63900, "drivetrain": "AWD", "horsepower": 544, "range": 272,
             "lease": {"monthly": 689, "term": 36, "miles": 10000, "due": 5995, "mf": 0.00175, "residual": 49}},
            {"name": "Performance Pack", "msrp": 72900, "drivetrain": "AWD", "horsepower": 544, "range": 270,
             "lease": {"monthly": 779, "term": 36, "miles": 10000, "due": 6495, "mf": 0.00185, "residual": 48}},
        ],
        "specs_base": {"batteryKwh": 100, "milesPerKwh": 3.0, "zeroToSixty": 3.7, "topSpeed": 124,
                        "torqueLbFt": 506, "seatingCapacity": 5, "cargoVolumeCuFt": 18.8, "frunkVolumeCuFt": 0.5,
                        "towingCapacityLbs": 3500, "groundClearanceIn": 6.5, "weightLbs": 5320,
                        "chargingSpeedDcFastKw": 200, "chargingSpeedL2Kw": 11, "chargingPort": "CCS",
                        "autopilot": True, "warrantyYears": 4, "batteryWarrantyYears": 8,
                        "batteryWarrantyMiles": 100000},
        "maintenance": 660,
        "depreciation": {"y1": 30, "y2": 43, "y3": 52, "y5": 63},
        "insurance": [1880, 2560, 3660],
        "priceHistory": [(2024, 9, 54900), (2025, 1, 56900)],
    },
]


# ─── Builders ────────────────────────────────────────────────────────────────
def estimate_finance_payment(msrp: int, apr: float = 6.49, term: int = 60, down_pct: float = 0.10) -> int:
    """Standard amortized loan: returns rounded monthly $."""
    p = msrp * (1 - down_pct)
    r = apr / 100 / 12
    if r == 0:
        return round(p / term)
    return round(p * (r * (1 + r) ** term) / ((1 + r) ** term - 1))


def build_trims(v: dict) -> list[dict]:
    """Convert compact trim dicts into the full schema used by the frontend."""
    colors = colors_for(v["make"])
    out = []
    for t in v["trims"]:
        finance_offers = [{
            "apr": 4.99 if "subventioned" in (t.get("lease") or {}) else 6.49,
            "termMonths": 60,
            "downPayment": 0,
            "expiresAt": OFFER_EXPIRY_ISO,
        }]
        lease_offers = []
        if t.get("lease"):
            le = t["lease"]
            lease_offers = [{
                "monthlyPayment": le["monthly"],
                "termMonths": le["term"],
                "mileagePerYear": le["miles"],
                "dueAtSigning": le["due"],
                "moneyFactor": le["mf"],
                "residualPercent": le["residual"],
                "acquisitionFee": 695 if v["make"] not in ("BMW", "Polestar") else 925,
                "dispositionFee": 395,
                "isSubventioned": bool(le.get("subventioned", False)),
                "expiresAt": OFFER_EXPIRY_ISO,
            }]

        # Build lastPriceChange from priceHistory (if last change in last 90d would be unrealistic
        # for static mock, so skip unless explicitly modeled).
        last_change = None
        ph = v.get("priceHistory", [])
        if len(ph) >= 2:
            (_, _, prev), (_, _, curr) = ph[-2], ph[-1]
            if curr != prev:
                # Use most recent date in priceHistory
                yy, mm, _ = ph[-1]
                last_change = {
                    "date": f"{yy:04d}-{mm:02d}-01T00:00:00+00:00",
                    "previousMsrp": prev,
                    "changeDollars": curr - prev,
                    "direction": "decrease" if curr < prev else "increase",
                }

        out.append({
            "name": t["name"],
            "msrp": t["msrp"],
            "destinationFee": 1395,
            "drivetrain": t["drivetrain"],
            "availableColors": colors,
            "lastPriceChange": last_change,
            "cashOffers": [],
            "financeOffers": finance_offers,
            "leaseOffers": lease_offers,
        })
    return out


def build_specs(v: dict, primary_trim: dict) -> dict:
    base = dict(v["specs_base"])
    base["range"] = primary_trim["range"]
    base["epaRangeCity"] = round(primary_trim["range"] * 1.10)
    base["epaRangeHwy"] = round(primary_trim["range"] * 0.90)
    base["horsepower"] = primary_trim["horsepower"]
    base["drivetrain"] = primary_trim["drivetrain"]
    return base


def build_price_history(v: dict) -> list[dict]:
    out = []
    for yy, mm, price in v.get("priceHistory", []):
        out.append({
            "date": f"{yy:04d}-{mm:02d}-01T00:00:00+00:00",
            "msrp": price,
        })
    return out


def build_vehicle_detail(v: dict) -> dict:
    trims = build_trims(v)
    primary_trim = v["trims"][0]
    specs = build_specs(v, primary_trim)
    image_url = HERO_IMAGES.get(v["id"], "")
    gallery = [image_url] if image_url else []
    interior = INTERIOR_IMAGES.get(v["id"])
    if interior:
        gallery.append(interior)

    return {
        "id": v["id"],
        "make": v["make"],
        "model": v["model"],
        "year": v["year"],
        "type": "new",
        "category": v["category"],
        "bodyStyle": v["bodyStyle"],
        "manufacturerUrl": v["manufacturerUrl"],
        "imageUrl": image_url,
        "imageGallery": gallery,
        "priceHistory": build_price_history(v),
        "lastUpdated": NOW_ISO,
        "comingSoon": v.get("comingSoon", False),
        "expectedReleaseYear": v.get("expectedReleaseYear"),
        "trims": trims,
        "specs": specs,
        "maintenance": {
            "averageAnnualCostUsd": v["maintenance"],
            "sourceUrl": "https://repairpal.com/",
            "notes": "EVs avoid oil changes, transmission service, and most engine maintenance. Brakes last longer thanks to regenerative braking. Costs above include tires, cabin filter, brake fluid, wiper blades, and battery coolant service.",
        },
        "depreciation": {
            "year1Percent": v["depreciation"]["y1"],
            "year2Percent": v["depreciation"]["y2"],
            "year3Percent": v["depreciation"]["y3"],
            "year5Percent": v["depreciation"]["y5"],
            "sourceUrl": "https://www.iseecars.com/",
        },
        "insuranceEstimateAnnual": {
            "low": v["insurance"][0],
            "average": v["insurance"][1],
            "high": v["insurance"][2],
            "source": "Policygenius 2025 EV insurance comparison",
        },
        "federalTaxCredit": {
            "eligibleNew": False,
            "amount": 0,
            "notes": "The $7,500 federal EV tax credit (IRA Section 30D) was repealed in 2025. No federal credit applies to new EV purchases.",
            "lastVerified": NOW_ISO,
        },
    }


def build_summary(detail: dict) -> dict:
    primary_trim = detail["trims"][0]
    lease_offer = primary_trim["leaseOffers"][0] if primary_trim["leaseOffers"] else None
    finance_from = estimate_finance_payment(primary_trim["msrp"])
    drivetrains = sorted({t["drivetrain"] for t in detail["trims"]})

    s = {
        "id": detail["id"],
        "make": detail["make"],
        "model": detail["model"],
        "year": detail["year"],
        "type": detail["type"],
        "category": detail["category"],
        "bodyStyle": detail["bodyStyle"],
        "msrpFrom": primary_trim["msrp"],
        "comingSoon": detail["comingSoon"],
        "expectedReleaseYear": detail.get("expectedReleaseYear"),
        "lastUpdated": detail["lastUpdated"],
        "rangeEpa": detail["specs"]["range"],
        "milesPerKwh": detail["specs"]["milesPerKwh"],
        "horsepower": detail["specs"]["horsepower"],
        "zeroToSixty": detail["specs"]["zeroToSixty"],
        "seatingCapacity": detail["specs"]["seatingCapacity"],
        "towingCapacityLbs": detail["specs"]["towingCapacityLbs"],
        "chargingPort": detail["specs"]["chargingPort"],
        "drivetrains": drivetrains,
        "imageUrl": detail["imageUrl"],
        "imageGallery": detail["imageGallery"],
        "financeFrom": finance_from,
        "federalCreditEligible": False,
        "federalCreditAmount": 0,
    }

    if lease_offer:
        s["leaseFrom"] = lease_offer["monthlyPayment"]
        s["offerExpiresAt"] = lease_offer["expiresAt"]

    # Surface lastPriceChange from primary trim so card can show "Price dropped" badge
    if primary_trim.get("lastPriceChange"):
        s["lastPriceChange"] = primary_trim["lastPriceChange"]

    return s


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)

    details = []
    summaries = []
    for v in VEHICLES:
        detail = build_vehicle_detail(v)
        details.append(detail)
        summaries.append(build_summary(detail))

        # Write per-vehicle detail JSON
        out_path = DETAIL_DIR / f"{detail['id']}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(detail, f, indent=2, ensure_ascii=False)

    # Sort summaries: coming-soon last, otherwise by MSRP ascending
    summaries.sort(key=lambda s: (s.get("comingSoon", False), s.get("msrpFrom") or 0))

    # Write summary
    with (OUT_DIR / "vehicles_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summaries, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(details)} detail JSONs to {DETAIL_DIR}")
    print(f"Wrote summary with {len(summaries)} entries to {OUT_DIR / 'vehicles_summary.json'}")


if __name__ == "__main__":
    main()
