"""
base_scraper.py — Base class for all vehicle scrapers.

Provides:
- Playwright browser with stealth configuration
- Polite rate limiting (1.5–3s between requests)
- Common HTTP client (httpx) for API calls
- Retry logic with exponential backoff
"""

import asyncio
import random
import httpx
from playwright.async_api import async_playwright

HAS_STEALTH = False
stealth_async = None

try:
    # playwright-stealth >= 1.0 uses stealth_async
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    try:
        # Older versions expose a Stealth class instead
        from playwright_stealth import Stealth
        async def stealth_async(page):
            await Stealth().apply_stealth_async(page)
        HAS_STEALTH = True
    except ImportError:
        HAS_STEALTH = False  # ← was incorrectly outside the inner except

if not HAS_STEALTH:
    print("[BaseScraper] WARNING: playwright-stealth not loading — bot detection possible")
    print("  Try: pip install playwright-stealth --break-system-packages")
else:
    print("[BaseScraper] playwright-stealth loaded ✓")


class BaseScraper:
    BRAND = "base"
    USER_AGENT = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self._playwright = None
        self._browser = None
        self._http_client = httpx.AsyncClient(
            headers={"User-Agent": self.USER_AGENT},
            timeout=30,
            follow_redirects=True,
        )

    async def get_browser_page(self):
        """Returns a new stealth-configured browser page."""
        if not self._playwright:
            self._playwright = await async_playwright().start()
        if not self._browser:
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
        context = await self._browser.new_context(
            user_agent=self.USER_AGENT,
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = await context.new_page()
        if HAS_STEALTH:
            await stealth_async(page)
        return page

    async def rate_limit(self, min_s: float = 1.5, max_s: float = 3.0):
        """Polite delay between requests — respect robots.txt spirit."""
        delay = random.uniform(min_s, max_s)
        await asyncio.sleep(delay)

    async def fetch_json(self, url: str, params: dict = None, retries: int = 3) -> dict | None:
        """Fetch JSON from a URL with retry logic."""
        for attempt in range(retries):
            try:
                response = await self._http_client.get(url, params=params)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                if attempt == retries - 1:
                    print(f"[{self.BRAND}] Failed to fetch {url}: {e}")
                    return None
                await asyncio.sleep(2 ** attempt)  # exponential backoff

    async def close(self):
        """Clean up browser and HTTP client."""
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        await self._http_client.aclose()

    async def scrape(self) -> list[dict]:
        """
        Override in each brand scraper.
        Returns a list of vehicle dicts conforming to the Firestore schema.
        """
        raise NotImplementedError

    def log(self, msg: str):
        print(f"[{self.BRAND.upper()}] {msg}")
