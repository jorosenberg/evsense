"""
selenium_base.py -- Base class for Selenium backup scrapers.

Used as a fallback when Playwright scraping fails (bot detection, timeout, etc.).
Uses webdriver-manager so no manual chromedriver path is required -- it
auto-downloads the correct ChromeDriver for the installed Chrome version.

Key differences from Playwright base:
  - Synchronous (Selenium is not async-native)
  - Uses undetected-chromedriver (uc) to bypass Cloudflare/bot detection
  - Falls back to standard selenium if uc is not installed
  - webdriver-manager handles ChromeDriver binary management automatically

Install:
    pip install selenium webdriver-manager undetected-chromedriver

Usage pattern in each brand scraper:
    from scrapers.selenium_base import SeleniumScraper

    class TeslaSeleniumScraper(SeleniumScraper):
        BRAND = "tesla"

        def scrape(self) -> list[dict]:
            driver = self.get_driver()
            try:
                driver.get("https://www.tesla.com/model3/design")
                self.wait_for_page()
                # ... parse ...
            finally:
                self.close()
            return results
"""

import time
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Try undetected-chromedriver first (better at bypassing bot detection)
try:
    import undetected_chromedriver as uc
    HAS_UC = True
    logger.info("[SeleniumBase] undetected-chromedriver available")
except ImportError:
    HAS_UC = False
    logger.info("[SeleniumBase] undetected-chromedriver not installed, using standard selenium")

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, WebDriverException
)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    HAS_WDM = True
except ImportError:
    HAS_WDM = False
    logger.warning("[SeleniumBase] webdriver-manager not installed -- ChromeDriver must be in PATH")

# -- WinError 6 fix -----------------------------------------------------------
# On Windows, uc.Chrome.__del__ calls time.sleep() during interpreter shutdown
# after the time module has been deallocated, raising OSError: [WinError 6].
# Fix: patch __del__ to be a no-op, and use atexit to quit drivers cleanly
# before shutdown begins (so __del__ has nothing left to do).
import atexit as _atexit

_active_uc_drivers: list = []

def _atexit_cleanup():
    """Quit all active UC drivers before Python interpreter begins shutdown."""
    for driver in list(_active_uc_drivers):
        try:
            driver.quit()
        except Exception:
            pass
    _active_uc_drivers.clear()

_atexit.register(_atexit_cleanup)

if HAS_UC:
    import platform as _platform
    if _platform.system() == "Windows":
        # Replace __del__ with a safe no-op. By the time __del__ runs,
        # atexit has already called quit() so there's nothing to do.
        def _safe_uc_del(self):
            pass
        try:
            uc.Chrome.__del__ = _safe_uc_del
        except (AttributeError, TypeError):
            pass


class SeleniumScraper:
    """
    Base class for all Selenium backup scrapers.
    Provides a configured Chrome driver, wait helpers, and rate limiting.
    """

    BRAND = "base"
    DEFAULT_TIMEOUT = 20  # seconds to wait for elements
    USER_AGENT = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )

    def __init__(self, dry_run: bool = False, headless: bool = True):
        self.dry_run = dry_run
        self.headless = headless
        self._driver: Optional[webdriver.Chrome] = None

    def get_driver(self) -> webdriver.Chrome:
        """Returns a configured Chrome WebDriver instance."""
        if self._driver:
            return self._driver

        if HAS_UC:
            self._driver = self._get_uc_driver()
            _active_uc_drivers.append(self._driver)
        else:
            self._driver = self._get_standard_driver()

        return self._driver

    def _get_uc_driver(self) -> webdriver.Chrome:
        """
        Undetected ChromeDriver -- much better at bypassing bot detection.
        Patches Chrome to remove automation indicators.
        """
        import platform
        options = uc.ChromeOptions()
        if self.headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-setuid-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1280,800")
        options.add_argument(f"--user-agent={self.USER_AGENT}")
        options.add_argument("--lang=en-US,en;q=0.9")

        # use_subprocess=False avoids the WinError 6 on Windows during interpreter shutdown
        # use_subprocess=True is needed on Linux/Mac for proper cleanup
        use_subprocess = platform.system() != "Windows"

        driver = uc.Chrome(options=options, use_subprocess=use_subprocess)
        driver.set_page_load_timeout(60)
        return driver

    def _get_standard_driver(self) -> webdriver.Chrome:
        """
        Standard Selenium ChromeDriver with anti-detection options.
        Uses webdriver-manager to auto-download the right ChromeDriver.
        """
        options = ChromeOptions()
        if self.headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-setuid-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1280,800")
        options.add_argument(f"--user-agent={self.USER_AGENT}")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-extensions")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        if HAS_WDM:
            service = ChromeService(ChromeDriverManager().install())
        else:
            service = ChromeService()  # assumes chromedriver in PATH

        driver = webdriver.Chrome(service=service, options=options)

        # Remove webdriver property (helps bypass some detection)
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        driver.set_page_load_timeout(60)
        return driver

    def wait_for_page(self, seconds: float = 2.0):
        """Polite wait after page load -- gives JS time to render."""
        time.sleep(seconds + random.uniform(0, 1.5))

    def rate_limit(self, min_s: float = 1.5, max_s: float = 3.5):
        """Polite delay between requests."""
        time.sleep(random.uniform(min_s, max_s))

    def wait_for_element(self, by: By, selector: str, timeout: int = None) -> object:
        """Wait for an element to be present and return it."""
        driver = self.get_driver()
        wait = WebDriverWait(driver, timeout or self.DEFAULT_TIMEOUT)
        return wait.until(EC.presence_of_element_located((by, selector)))

    def wait_for_elements(self, by: By, selector: str, timeout: int = None) -> list:
        """Wait for elements and return all matching."""
        driver = self.get_driver()
        wait = WebDriverWait(driver, timeout or self.DEFAULT_TIMEOUT)
        return wait.until(EC.presence_of_all_elements_located((by, selector)))

    def safe_find(self, by: By, selector: str, parent=None) -> Optional[object]:
        """Find element without raising -- returns None if not found."""
        try:
            root = parent or self.get_driver()
            return root.find_element(by, selector)
        except NoSuchElementException:
            return None

    def safe_text(self, by: By, selector: str, parent=None, default: str = "") -> str:
        """Get element text without raising."""
        el = self.safe_find(by, selector, parent)
        return el.text.strip() if el else default

    def get_page_source(self, url: str) -> str:
        """Navigate to URL and return page source after JS execution."""
        driver = self.get_driver()
        try:
            driver.get(url)
            self.wait_for_page()
            return driver.page_source
        except WebDriverException as e:
            logger.error(f"[{self.BRAND}] Failed to load {url}: {e}")
            return ""

    def execute_script(self, script: str, *args):
        """Execute JavaScript in the current page context."""
        return self.get_driver().execute_script(script, *args)

    def get_json_from_page(self, js_variable: str):
        """
        Extract a JavaScript variable from the page context.
        Common pattern: Tesla, GM, VW embed pricing in window.__DATA__ etc.
        """
        import json
        try:
            result = self.execute_script(f"return JSON.stringify({js_variable})")
            return json.loads(result) if result else None
        except Exception as e:
            logger.debug(f"[{self.BRAND}] Could not extract {js_variable}: {e}")
            return None

    def scroll_to_bottom(self, pause: float = 0.8):
        """Scroll page to bottom to trigger lazy-loaded content."""
        driver = self.get_driver()
        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(pause)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

    def close(self):
        """Quit the browser and clean up. Suppresses Windows WinError 6."""
        if self._driver:
            try:
                _active_uc_drivers.remove(self._driver)
            except (ValueError, NameError):
                pass
            try:
                self._driver.quit()
            except OSError:
                pass
            except Exception:
                pass
            finally:
                self._driver = None

    def scrape(self) -> list[dict]:
        """Override in each brand scraper."""
        raise NotImplementedError

    def log(self, msg: str):
        logger.info(f"[{self.BRAND.upper()}-selenium] {msg}")