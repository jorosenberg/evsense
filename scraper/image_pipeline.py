"""
image_pipeline.py — Vehicle image fetch + transcode + storage (local OR S3).

What this does:
  1. Looks up an image URL for a vehicle (ev-database.org pattern, then fallbacks)
  2. Downloads it with a polite User-Agent
  3. Resizes to 3 responsive breakpoints (400 / 800 / 1200 px wide)
  4. Crops to a clean 16:9 from center if the source is taller than that
  5. Encodes to WebP at quality 82
  6. Writes to either:
       - LOCAL: frontend/public/data/images/{vehicle_id}/{width}w.webp
       - S3:    s3://{bucket}/vehicles/{vehicle_id}/{width}w.webp

Why both modes:
  - LOCAL keeps the entire stack runnable on a laptop with zero AWS account.
    The Vite dev server serves /data/images/... directly.
  - S3 is the production path — same key layout, CloudFront in front.

Per-vehicle return shape is the `imagesCdnBase` URL the frontend uses for srcset.

Usage (programmatic):
    from image_pipeline import ImagePipeline
    pipe = ImagePipeline(mode='local')                  # writes to frontend/public/data/images
    base = pipe.process('tesla-model3-2025', 'Tesla', 'Model 3', 2025)
    # → '/data/images/tesla-model3-2025'

CLI:
    python image_pipeline.py --dry-run
    python image_pipeline.py --vehicle tesla-model3-2025
    python image_pipeline.py --mode s3 --bucket my-bucket --cdn-domain d123.cloudfront.net
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from PIL import Image

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRAPER_DIR    = Path(__file__).resolve().parent
PROJECT_ROOT   = SCRAPER_DIR.parent
FRONTEND_DIR   = PROJECT_ROOT / "frontend"
DATA_DIR       = FRONTEND_DIR / "public" / "data"
LOCAL_IMG_DIR  = DATA_DIR / "images"
SUMMARY_PATH   = DATA_DIR / "vehicles_summary.json"

# ── Config ────────────────────────────────────────────────────────────────────
# ev-database.org returns 403 to bot User-Agents. We use a real browser UA
# string here — this is technically a "polite" scrape (single GET per vehicle
# once a month, with throttling), not high-volume.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

BREAKPOINTS = (400, 800, 1200)
WEBP_QUALITY = 82
TARGET_ASPECT = 16 / 9
MIN_VALID_BYTES = 5_000   # below this, treat as 404 placeholder

# ev-database.org slug pattern (their CDN). May be replaced by smarter discovery later.
EVDB_SLUG_OVERRIDES = {
    # vehicle_id → ev-database slug (only when our slugify() gets it wrong)
    "ford-mustang-mach-e-2025":  "ford-mustang-mach-e",
    "ford-f150-lightning-2025":  "ford-f-150-lightning",
    "ford-f-150-lightning-2025": "ford-f-150-lightning",
    "tesla-model3-2025":         "tesla-model-3",
    "tesla-modely-2025":         "tesla-model-y",
    "tesla-models-2025":         "tesla-model-s",
    "tesla-modelx-2025":         "tesla-model-x",
    "tesla-cybertruck-2025":     "tesla-cybertruck",
    "polestar-2-2025":           "polestar-2",
    "polestar-polestar-2-2025":  "polestar-2",
    "polestar-polestar-3-2025":  "polestar-3",
    "polestar-polestar-4-2025":  "polestar-4",
    "volkswagen-id4-2025":       "volkswagen-id-4",
    "volkswagen-id-buzz-2025":   "volkswagen-id-buzz",
    "hyundai-ioniq-5-2025":      "hyundai-ioniq-5",
    "hyundai-ioniq-6-2025":      "hyundai-ioniq-6",
    "hyundai-ioniq-9-2025":      "hyundai-ioniq-9",
    "kia-ev6-2025":              "kia-ev6",
    "kia-ev9-2025":              "kia-ev9",
    "rivian-r1t-2025":           "rivian-r1t-quad-motor",
    "rivian-r1s-2025":           "rivian-r1s-quad-motor",
    "bmw-i4-2025":               "bmw-i4-edrive35",
    "bmw-i5-2025":               "bmw-i5-edrive40",
    "bmw-i7-2025":               "bmw-i7-xdrive60",
    "bmw-ix-2025":               "bmw-ix-xdrive50",
    "lucid-air-2025":            "lucid-air-pure",
    "lucid-gravity-2025":        "lucid-gravity-grand-touring",
    "chevrolet-equinox-ev-2025":  "chevrolet-equinox-ev",
    "chevrolet-blazer-ev-2025":   "chevrolet-blazer-ev",
    "chevrolet-silverado-ev-2025": "chevrolet-silverado-ev",
}


# ── Logging ───────────────────────────────────────────────────────────────────
def _get_logger():
    log = logging.getLogger("image_pipeline")
    if not log.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
        log.addHandler(h)
        log.setLevel(logging.INFO)
    return log

log = _get_logger()


# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(*parts: str) -> str:
    """tesla / Model 3 → tesla-model-3"""
    raw = " ".join(p for p in parts if p)
    raw = raw.lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return raw


def evdb_candidate_slugs(vehicle_id: str, make: str, model: str) -> list[str]:
    """All slug attempts for a given vehicle in ev-database.org's URL space."""
    explicit = EVDB_SLUG_OVERRIDES.get(vehicle_id)
    candidates = []
    if explicit:
        candidates.append(explicit)
    candidates.append(slugify(make, model))
    # Some EVDB URLs use a year suffix (e.g. -2024)
    candidates.append(f"{slugify(make, model)}-2024")
    candidates.append(f"{slugify(make, model)}-2025")
    # De-dupe preserving order
    seen, out = set(), []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


# ── Result types ──────────────────────────────────────────────────────────────
@dataclass
class ProcessResult:
    vehicle_id: str
    cdn_base: Optional[str]   # URL prefix without /{width}w.webp
    source_url: Optional[str]
    bytes_uploaded: int
    skipped: bool = False
    error: Optional[str] = None


# ── Source-of-truth fetcher ───────────────────────────────────────────────────
# Load ev_database.json once for cross-vehicle image lookup
_evdb_cache: Optional[list[dict]] = None

def _load_evdb_images() -> list[dict]:
    global _evdb_cache
    if _evdb_cache is None:
        evdb_path = DATA_DIR / "ev_database.json"
        if evdb_path.exists():
            data = json.loads(evdb_path.read_text("utf-8"))
            _evdb_cache = data.get("vehicles", [])
        else:
            _evdb_cache = []
    return _evdb_cache


def _find_evdb_image_url(make: str, model: str) -> Optional[str]:
    """Locate an image_url in ev_database.json by case-insensitive make+model."""
    target = (make + " " + model).lower().strip()
    for v in _load_evdb_images():
        name = (v.get("name") or "").lower()
        v_make = (v.get("make") or "").lower()
        v_model = (v.get("model") or "").lower()
        if not v.get("image_url"):
            continue
        if name == target or (v_make == make.lower() and v_model == model.lower()):
            return v.get("image_url")
        # Fuzzy: target matches name prefix
        if name.startswith(target):
            return v.get("image_url")
    return None


def fetch_source_image(
    vehicle_id: str,
    make: str,
    model: str,
    year: int,
    fallback_url: Optional[str] = None,
    timeout: float = 12.0,
) -> tuple[Optional[bytes], Optional[str]]:
    """
    Source-priority pipeline:
      1. ev_database.json's pre-scraped image_url (most reliable — fresh URLs)
      2. fallback_url from vehicle_summary.json (curated Wikipedia/manufacturer)
      3. ev-database.org direct slug guessing (last resort, brittle)

    Returns (image_bytes, source_url) or (None, None) on total failure.
    """
    headers = {"User-Agent": USER_AGENT, "Referer": "https://ev-database.org/"}

    def _try_url(url: str) -> Optional[bytes]:
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as c:
                r = c.get(url)
                if r.status_code == 200 and len(r.content) > MIN_VALID_BYTES:
                    return r.content
                log.debug(f"[{vehicle_id}] {url[:80]} → {r.status_code} ({len(r.content)}B)")
        except Exception as e:
            log.debug(f"[{vehicle_id}] {url[:80]} error: {e}")
        return None

    # 1) Look up image URL inside ev_database.json (already scraped & validated)
    evdb_url = _find_evdb_image_url(make, model)
    if evdb_url:
        data = _try_url(evdb_url)
        if data:
            log.info(f"[{vehicle_id}] ev_database.json image hit")
            return data, evdb_url

    # 2) Try the fallback URL on the vehicle row (Wikipedia etc)
    if fallback_url:
        data = _try_url(fallback_url)
        if data:
            log.info(f"[{vehicle_id}] fallback URL hit")
            return data, fallback_url

    # 3) Last-ditch: guess ev-database slugs
    for slug in evdb_candidate_slugs(vehicle_id, make, model):
        for path in (f"/img/auto/{slug}/{slug}-front.jpg", f"/img/auto/{slug}.jpg"):
            url = f"https://ev-database.org{path}"
            data = _try_url(url)
            if data:
                log.info(f"[{vehicle_id}] ev-database slug hit: {url}")
                return data, url

    log.warning(f"[{vehicle_id}] no usable image source found")
    return None, None


# ── Transcoder ────────────────────────────────────────────────────────────────
def transcode_to_webp_set(raw: bytes) -> dict[int, bytes]:
    """
    Decode raw bytes → 3 WebP variants @ 400/800/1200 wide. 16:9 center crop.
    """
    img = Image.open(io.BytesIO(raw)).convert("RGB")

    # Center-crop to 16:9 if source is taller (vehicles look best wide)
    w, h = img.size
    target_h = int(w / TARGET_ASPECT)
    if h > target_h:
        top = (h - target_h) // 2
        img = img.crop((0, top, w, top + target_h))

    out: dict[int, bytes] = {}
    for width in BREAKPOINTS:
        if width >= img.width:
            resized = img
        else:
            ratio = width / img.width
            resized = img.resize((width, int(img.height * ratio)), Image.LANCZOS)

        buf = io.BytesIO()
        resized.save(buf, format="WEBP", quality=WEBP_QUALITY, method=4)
        out[width] = buf.getvalue()
    return out


# ── Storage backends ──────────────────────────────────────────────────────────
class _LocalStorage:
    """Writes to frontend/public/data/images/{vehicle_id}/{width}w.webp."""

    def __init__(self, root: Path = LOCAL_IMG_DIR):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, vehicle_id: str, width: int, data: bytes) -> int:
        d = self.root / vehicle_id
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{width}w.webp"
        path.write_bytes(data)
        return len(data)

    def cdn_base(self, vehicle_id: str) -> str:
        # Served by Vite/Express from /data/images/...
        return f"/data/images/{vehicle_id}"


class _S3Storage:
    """Writes to s3://{bucket}/vehicles/{vehicle_id}/{width}w.webp."""

    def __init__(self, bucket: str, cdn_domain: Optional[str] = None, region: str = "us-east-1"):
        try:
            import boto3
        except ImportError as e:
            raise RuntimeError("boto3 not installed; pip install boto3") from e
        self.bucket = bucket
        self.cdn_domain = cdn_domain
        self.s3 = boto3.client("s3", region_name=region)

    def put(self, vehicle_id: str, width: int, data: bytes) -> int:
        key = f"vehicles/{vehicle_id}/{width}w.webp"
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        return len(data)

    def cdn_base(self, vehicle_id: str) -> str:
        if self.cdn_domain:
            return f"https://{self.cdn_domain}/vehicles/{vehicle_id}"
        return f"https://{self.bucket}.s3.amazonaws.com/vehicles/{vehicle_id}"


# ── Pipeline ──────────────────────────────────────────────────────────────────
class ImagePipeline:
    """
    High-level orchestrator. Choose `mode='local'` for dev, `'s3'` for prod.
    """

    def __init__(
        self,
        mode: str = "local",
        bucket: Optional[str] = None,
        cdn_domain: Optional[str] = None,
        region: str = "us-east-1",
        dry_run: bool = False,
    ):
        self.dry_run = dry_run
        if mode == "local":
            self.storage = _LocalStorage()
        elif mode == "s3":
            if not bucket:
                raise ValueError("S3 mode requires --bucket")
            self.storage = _S3Storage(bucket=bucket, cdn_domain=cdn_domain, region=region)
        else:
            raise ValueError(f"Unknown mode: {mode}")

    def process(
        self,
        vehicle_id: str,
        make: str,
        model: str,
        year: int,
        fallback_url: Optional[str] = None,
    ) -> ProcessResult:
        try:
            raw, source_url = fetch_source_image(vehicle_id, make, model, year, fallback_url)
            if not raw:
                return ProcessResult(vehicle_id, None, None, 0, error="no source image")

            variants = transcode_to_webp_set(raw)
            total = 0
            if not self.dry_run:
                for width, data in variants.items():
                    total += self.storage.put(vehicle_id, width, data)
            else:
                total = sum(len(v) for v in variants.values())
                log.info(f"[{vehicle_id}] DRY-RUN — would write {total // 1024}KB across 3 sizes")

            cdn_base = self.storage.cdn_base(vehicle_id)
            log.info(f"[{vehicle_id}] OK → {cdn_base} ({total // 1024}KB total)")
            return ProcessResult(vehicle_id, cdn_base, source_url, total)
        except Exception as e:
            log.error(f"[{vehicle_id}] FAILED: {e}")
            return ProcessResult(vehicle_id, None, None, 0, error=str(e))

    def process_summary_file(
        self,
        summary_path: Path = SUMMARY_PATH,
        vehicle_filter: Optional[str] = None,
        sleep_between: float = 0.6,
    ) -> dict:
        """
        Drive a full pass over vehicles_summary.json, attaching `imagesCdnBase`
        to each vehicle and writing the JSON back.

        Returns a report dict.
        """
        if not summary_path.exists():
            raise FileNotFoundError(f"vehicles_summary.json not found at {summary_path}")

        vehicles = json.loads(summary_path.read_text(encoding="utf-8"))
        succeeded, failed, skipped = 0, 0, 0
        results: list[ProcessResult] = []

        for v in vehicles:
            vid = v.get("id")
            if not vid:
                continue
            if vehicle_filter and vid != vehicle_filter:
                continue

            res = self.process(
                vehicle_id=vid,
                make=v.get("make", ""),
                model=v.get("model", ""),
                year=v.get("year", 2025),
                fallback_url=v.get("imageUrl"),
            )
            results.append(res)
            if res.cdn_base:
                v["imagesCdnBase"] = res.cdn_base
                if res.source_url:
                    v["imageSourceUrl"] = res.source_url
                succeeded += 1
            elif res.error:
                failed += 1
            else:
                skipped += 1

            time.sleep(sleep_between)  # polite throttle

        # Write JSON back (only if we processed at least one and not dry-run)
        if not self.dry_run and (succeeded or failed):
            summary_path.write_text(json.dumps(vehicles, indent=2), encoding="utf-8")
            log.info(f"Wrote {len(vehicles)} entries back to {summary_path}")

        return {
            "total":     len(results),
            "succeeded": succeeded,
            "failed":    failed,
            "skipped":   skipped,
            "outputDir": str(self.storage.cdn_base("EXAMPLE_ID")),
        }


# ── CLI ───────────────────────────────────────────────────────────────────────
def _main():
    parser = argparse.ArgumentParser(description="EVsense image pipeline (local or S3)")
    parser.add_argument("--mode", choices=("local", "s3"), default="local")
    parser.add_argument("--bucket", help="S3 bucket name (required if --mode=s3)")
    parser.add_argument("--cdn-domain", help="CloudFront domain (S3 mode)")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--vehicle", help="Process a single vehicle id")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.6, help="Sleep between vehicles (sec)")
    args = parser.parse_args()

    pipe = ImagePipeline(
        mode=args.mode,
        bucket=args.bucket,
        cdn_domain=args.cdn_domain,
        region=args.region,
        dry_run=args.dry_run,
    )
    report = pipe.process_summary_file(vehicle_filter=args.vehicle, sleep_between=args.sleep)
    print("\n" + json.dumps(report, indent=2))


if __name__ == "__main__":
    _main()
