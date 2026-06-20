"""
fetch_vehicle_images.py — Download vehicle images into per-vehicle folders.

Reads scraper/overrides/vehicle_images.yaml, downloads each URL into
frontend/public/data/images/<vehicleId>/, and (when preferLocal) rewrites the
per-vehicle detail JSON to point at the local files:
    imageUrl       → /data/images/<id>/default.<ext>
    imageGallery   → [/data/images/<id>/gallery-1.<ext>, ...]
    trims[].image  → /data/images/<id>/<trim-slug>.<ext>

Plain HTTP (no Akamai here) — uses curl_cffi if available, else httpx, else
urllib. Run after adding URLs to the YAML:

    python scraper/processors/fetch_vehicle_images.py
    python scraper/processors/fetch_vehicle_images.py --dry-run
    python scraper/processors/fetch_vehicle_images.py --only tesla-model3-2025
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

SCRAPER_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SCRAPER_DIR.parent
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
IMAGES_DIR = DATA_DIR / "images"
VEHICLES_DIR = DATA_DIR / "vehicles"
YAML_PATH = SCRAPER_DIR / "overrides" / "vehicle_images.yaml"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def _slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-")


def _ext(url: str) -> str:
    path = urlparse(url).path.lower()
    for e in (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"):
        if path.endswith(e):
            return e
    return ".jpg"


def _load_yaml() -> dict:
    try:
        import yaml  # type: ignore
    except ImportError as e:
        raise RuntimeError("PyYAML not installed. Run: pip install pyyaml") from e
    if not YAML_PATH.exists():
        return {}
    return yaml.safe_load(YAML_PATH.read_text("utf-8")) or {}


def _download(url: str, dest: Path) -> bool:
    data = None
    try:
        from curl_cffi import requests as cf  # type: ignore
        r = cf.get(url, impersonate="chrome", timeout=40)
        if r.status_code == 200 and r.content:
            data = r.content
    except Exception:
        pass
    if data is None:
        try:
            import httpx
            with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=40) as c:
                r = c.get(url)
                if r.status_code == 200:
                    data = r.content
        except Exception:
            pass
    if data is None:
        try:
            import urllib.request
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as resp:  # noqa: S310
                data = resp.read()
        except Exception as e:  # noqa: BLE001
            print(f"    download failed: {url} ({e})")
            return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return True


def _strip_year(vid: str) -> str:
    return re.sub(r"-(?:19|20)\d{2}$", "", vid or "")


def run(only: str | None = None, dry_run: bool = False, debug: bool = False) -> dict:
    data = _load_yaml()
    prefer_local = bool((data.get("defaults") or {}).get("preferLocal", True))
    vehicles = data.get("vehicles") or {}
    report = {"updated": [], "downloaded": 0, "skipped": [], "dryRun": dry_run}

    # Resolve YAML keys to the actual vehicle id (year-insensitive), so a key like
    # toyota-bz-2026 maps to the real detail file / image folder.
    summary_ids = []
    summary_path = DATA_DIR / "vehicles_summary.json"
    if summary_path.exists():
        summary_ids = [r.get("id") for r in json.loads(summary_path.read_text("utf-8")) if r.get("id")]
    base_to_id = {}
    for sid in summary_ids:
        base_to_id.setdefault(_strip_year(sid), sid)

    def _resolve(key: str) -> str:
        if key in summary_ids:
            return key
        return base_to_id.get(_strip_year(key), key)

    for raw_vid, spec in vehicles.items():
        if only and raw_vid != only and _resolve(raw_vid) != only:
            continue
        vid = _resolve(raw_vid)
        if not spec or not (spec.get("default") or spec.get("gallery") or spec.get("trims")):
            report["skipped"].append(vid)
            continue

        out_dir = IMAGES_DIR / vid
        base = f"/data/images/{vid}"
        local_default = None
        local_gallery = []
        local_trims = {}

        if spec.get("default"):
            fn = f"default{_ext(spec['default'])}"
            if not dry_run and _download(spec["default"], out_dir / fn):
                report["downloaded"] += 1
            local_default = f"{base}/{fn}"

        for i, url in enumerate(spec.get("gallery") or [], start=1):
            fn = f"gallery-{i}{_ext(url)}"
            if not dry_run and _download(url, out_dir / fn):
                report["downloaded"] += 1
            local_gallery.append(f"{base}/{fn}")

        for trim_name, url in (spec.get("trims") or {}).items():
            fn = f"{_slug(trim_name)}{_ext(url)}"
            if not dry_run and _download(url, out_dir / fn):
                report["downloaded"] += 1
            local_trims[trim_name] = f"{base}/{fn}"

        # Rewrite the detail JSON to point at the images.
        detail_path = VEHICLES_DIR / f"{vid}.json"
        if detail_path.exists():
            detail = json.loads(detail_path.read_text("utf-8"))
            chosen_default = (local_default if prefer_local else spec.get("default"))
            if chosen_default:
                detail["imageUrl"] = chosen_default
            gallery_src = (local_gallery if prefer_local else (spec.get("gallery") or []))
            if gallery_src:
                detail["imageGallery"] = ([chosen_default] if chosen_default else []) + gallery_src
            for t in detail.get("trims", []):
                key = t.get("name")
                if key in (local_trims if prefer_local else (spec.get("trims") or {})):
                    t["image"] = (local_trims if prefer_local else spec["trims"])[key]
            if not dry_run:
                detail_path.write_text(json.dumps(detail, indent=2, ensure_ascii=False), encoding="utf-8")
            report["updated"].append(vid)
        if debug:
            print(f"  {vid}: default={bool(local_default)} gallery={len(local_gallery)} trims={len(local_trims)}")

    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Download vehicle images from vehicle_images.yaml")
    ap.add_argument("--only", help="Only this vehicle id")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()
    rep = run(only=args.only, dry_run=args.dry_run, debug=args.debug)
    print(json.dumps(rep, indent=2))
    print(f"\n{'[dry-run] ' if args.dry_run else ''}downloaded {rep['downloaded']} image(s); "
          f"updated {len(rep['updated'])} vehicle file(s); skipped {len(rep['skipped'])}.")


if __name__ == "__main__":
    main()
