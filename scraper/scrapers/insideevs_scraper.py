"""
insideevs_scraper.py — Scrapes InsideEVs for EV news, reviews, and buying advice.

InsideEVs is the leading EV news publication. This scraper pulls articles
via the RSS feed (more reliable than scraping HTML) and matches them to
vehicle IDs by title keyword.

Data stored in Firestore: vehicles/{id}/expertReviews/insideevs[]

Usage:
    python scraper/scrapers/insideevs_scraper.py
    python scraper/scrapers/insideevs_scraper.py --vehicle tesla-model-3-2024
    python scraper/scrapers/insideevs_scraper.py --dry-run
"""

import asyncio
import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import USER_AGENT, RATE_LIMIT_MIN_S, setup_logging

import logging
setup_logging()

INSIDEEVS_RSS = "https://insideevs.com/feed/"

VEHICLE_SEARCH_TERMS = {
    "tesla-model-3-2024":        ["Tesla Model 3", "Model 3"],
    "tesla-model-y-2024":        ["Tesla Model Y", "Model Y"],
    "ford-mustang-mach-e-2024":  ["Mustang Mach-E", "Mach-E"],
    "ford-f-150-lightning-2024": ["F-150 Lightning"],
    "chevrolet-equinox-ev-2024": ["Equinox EV"],
    "chevrolet-blazer-ev-2024":  ["Blazer EV"],
    "hyundai-ioniq-5-2024":      ["IONIQ 5", "Ioniq 5"],
    "hyundai-ioniq-6-2024":      ["IONIQ 6", "Ioniq 6"],
    "kia-ev6-2024":              ["Kia EV6", "EV6"],
    "kia-ev9-2024":              ["Kia EV9", "EV9"],
    "volkswagen-id4-2024":       ["ID.4", "ID4"],
    "rivian-r1t-2024":           ["Rivian R1T", "R1T"],
    "rivian-r1s-2024":           ["Rivian R1S", "R1S"],
    "bmw-i4-2024":               ["BMW i4"],
    "lucid-air-2024":            ["Lucid Air"],
    "polestar-polestar-2-2024":  ["Polestar 2"],
}


async def fetch_rss(client):
    try:
        resp = await client.get(INSIDEEVS_RSS, timeout=15)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        channel = root.find("channel")
        articles = []
        for item in channel.findall("item") if channel else []:
            title    = item.findtext("title", "").strip()
            link     = item.findtext("link", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            desc     = BeautifulSoup(item.findtext("description", ""), "lxml").get_text()[:300]
            category = "review" if "/reviews/" in link else "buying_advice" if "buying" in title.lower() else "feature" if "/features/" in link else "news"
            articles.append({"title": title, "url": link, "pubDate": pub_date, "summary": desc, "category": category, "source": "InsideEVs"})
        logging.info(f"[InsideEVs] {len(articles)} articles fetched")
        return articles
    except Exception as e:
        logging.error(f"[InsideEVs] RSS failed: {e}")
        return []


async def run_insideevs_scraper(vehicle_filter=None, dry_run=False):
    from firebase_client import FirebaseClient
    db = FirebaseClient()

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        articles = await fetch_rss(client)
        if not articles:
            return

        for vid in ([vehicle_filter] if vehicle_filter else list(VEHICLE_SEARCH_TERMS)):
            terms = VEHICLE_SEARCH_TERMS.get(vid, [])
            matched = [a for a in articles if any(t.lower() in a["title"].lower() for t in terms)]
            priority = {"review": 0, "buying_advice": 1, "feature": 2, "news": 3}
            matched = sorted(matched, key=lambda a: priority.get(a["category"], 4))[:5]

            if not matched:
                logging.info(f"  [{vid}] No articles found")
                continue

            logging.info(f"  [{vid}] {len(matched)} article(s) matched")
            for a in matched:
                logging.info(f"    [{a['category']}] {a['title'][:70]}")

            if not dry_run:
                db._db.collection("vehicles").document(vid).set(
                    {"expertReviews": {"insideevs": matched, "lastUpdated": datetime.now(timezone.utc).isoformat()}},
                    merge=True,
                )

    if dry_run:
        logging.info("[DRY RUN] No data written.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--vehicle")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_insideevs_scraper(args.vehicle, args.dry_run))
