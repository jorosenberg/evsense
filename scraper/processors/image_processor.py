"""
image_processor.py — Downloads vehicle images and uploads them to Firebase Storage.

For each vehicle in Firestore, this processor:
1. Fetches the manufacturer image URL (from the scraped document)
2. Downloads the image via httpx
3. Resizes/optimises it with Pillow (max 1360×765, WebP, quality 85)
4. Uploads to Firebase Storage at gs://YOUR_BUCKET/vehicles/{vehicle_id}.webp
5. Updates the Firestore document's imageUrl field with the Storage URL

Why we store images in Firebase Storage instead of hotlinking manufacturer CDNs:
- Manufacturer CDNs block hotlinking or change URLs without notice
- We control image availability and format (WebP saves ~30% over JPEG)
- Consistent aspect ratio (16:9) for the vehicle grid

Usage:
    python scraper/processors/image_processor.py
    python scraper/processors/image_processor.py --vehicle tesla-model-3-2024
    python scraper/processors/image_processor.py --dry-run
"""

import asyncio
import argparse
import io
import sys
from pathlib import Path
from datetime import datetime, timezone

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    NREL_API_KEY, USER_AGENT, RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S,
    COLLECTION_VEHICLES, setup_logging
)
from firebase_client import FirebaseClient

import logging
setup_logging()

# Target image dimensions (16:9)
TARGET_WIDTH  = 1360
TARGET_HEIGHT = 765
WEBP_QUALITY  = 85
MAX_FILE_SIZE_KB = 200  # Re-encode at lower quality if over this


async def process_vehicle_image(
    vehicle_id: str,
    image_url: str,
    storage_bucket,
    dry_run: bool = False,
) -> str | None:
    """
    Download, resize, and upload a single vehicle image.
    Returns the Firebase Storage public URL, or None on failure.
    """
    if not image_url:
        logging.warning(f'[{vehicle_id}] No image URL — skipping')
        return None

    # Download
    async with httpx.AsyncClient(
        headers={'User-Agent': USER_AGENT},
        follow_redirects=True,
        timeout=20,
    ) as client:
        try:
            resp = await client.get(image_url)
            resp.raise_for_status()
            raw_bytes = resp.content
            logging.info(f'[{vehicle_id}] Downloaded {len(raw_bytes) // 1024}KB from {image_url[:60]}…')
        except Exception as e:
            logging.error(f'[{vehicle_id}] Download failed: {e}')
            return None

    # Process with Pillow
    try:
        img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')

        # Resize to fit 16:9 target, cropping if needed
        img_ratio = img.width / img.height
        target_ratio = TARGET_WIDTH / TARGET_HEIGHT

        if img_ratio > target_ratio:
            # Image is wider — crop sides
            new_height = img.height
            new_width = int(img.height * target_ratio)
            left = (img.width - new_width) // 2
            img = img.crop((left, 0, left + new_width, new_height))
        elif img_ratio < target_ratio:
            # Image is taller — crop top/bottom
            new_width = img.width
            new_height = int(img.width / target_ratio)
            top = (img.height - new_height) // 2
            img = img.crop((0, top, new_width, top + new_height))

        img = img.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.LANCZOS)

        # Encode to WebP
        buf = io.BytesIO()
        quality = WEBP_QUALITY
        img.save(buf, format='WEBP', quality=quality, optimize=True)

        # If too large, reduce quality
        while buf.tell() > MAX_FILE_SIZE_KB * 1024 and quality > 50:
            quality -= 10
            buf = io.BytesIO()
            img.save(buf, format='WEBP', quality=quality, optimize=True)

        webp_bytes = buf.getvalue()
        logging.info(f'[{vehicle_id}] Processed: {len(webp_bytes) // 1024}KB WebP (quality={quality})')

    except Exception as e:
        logging.error(f'[{vehicle_id}] Image processing failed: {e}')
        return None

    if dry_run:
        logging.info(f'[{vehicle_id}] DRY RUN — would upload {len(webp_bytes) // 1024}KB WebP')
        return f'https://storage.googleapis.com/BUCKET/vehicles/{vehicle_id}.webp'

    # Upload to Firebase Storage
    try:
        storage_path = f'vehicles/{vehicle_id}.webp'
        blob = storage_bucket.blob(storage_path)
        blob.upload_from_string(webp_bytes, content_type='image/webp')
        blob.make_public()
        public_url = blob.public_url
        logging.info(f'[{vehicle_id}] Uploaded → {public_url}')
        return public_url
    except Exception as e:
        logging.error(f'[{vehicle_id}] Storage upload failed: {e}')
        return None


async def process_all_images(vehicle_filter: str = None, dry_run: bool = False):
    """Process images for all vehicles (or a single vehicle if filter is set)."""

    import firebase_admin
    from firebase_admin import credentials, firestore, storage as fb_storage
    import json, os

    # Init Firebase
    sa_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
    if not sa_json:
        raise EnvironmentError('FIREBASE_SERVICE_ACCOUNT not set')
    sa = json.loads(sa_json)
    if not firebase_admin._apps:
        cred = credentials.Certificate(sa)
        firebase_admin.initialize_app(cred, {
            'storageBucket': sa.get('project_id', '') + '.appspot.com'
        })

    db = firestore.client()
    bucket = fb_storage.bucket()

    # Fetch vehicles
    if vehicle_filter:
        docs = [db.collection('vehicles').document(vehicle_filter).get()]
        docs = [d for d in docs if d.exists]
    else:
        docs = list(db.collection('vehicles').stream())

    logging.info(f'Processing images for {len(docs)} vehicle(s)…')

    updated = 0
    failed = 0

    for doc in docs:
        data = doc.to_dict()
        vid = doc.id
        original_url = data.get('imageUrl', '')

        # Skip if already a Firebase Storage URL (already processed)
        if 'firebasestorage.googleapis.com' in original_url or 'storage.googleapis.com' in original_url:
            logging.info(f'[{vid}] Already in Storage — skipping')
            continue

        new_url = await process_vehicle_image(vid, original_url, bucket, dry_run=dry_run)

        if new_url and not dry_run:
            db.collection('vehicles').document(vid).update({
                'imageUrl': new_url,
                'imageProcessedAt': datetime.now(timezone.utc).isoformat(),
            })
            updated += 1
        elif not new_url:
            failed += 1

        # Polite delay
        import random
        await asyncio.sleep(random.uniform(RATE_LIMIT_MIN_S, RATE_LIMIT_MAX_S))

    logging.info(f'\nDone — {updated} updated, {failed} failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='EVsense Image Processor')
    parser.add_argument('--vehicle', help='Process a single vehicle ID')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    asyncio.run(process_all_images(
        vehicle_filter=args.vehicle,
        dry_run=args.dry_run,
    ))
