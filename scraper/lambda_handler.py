"""
EVsense Scraper — AWS Lambda Handler

Entry point invoked by:
  - EventBridge monthly schedule (input: {"source": "eventbridge-schedule"})
  - API Gateway POST /scrape (input: { "brand": "...", "uploadImages": true })
  - API Gateway GET /status  (returns last-run metadata)

Reads API keys from Secrets Manager (ARNs set as Lambda env vars).
Writes results to:
  - S3 (vehicle images)
  - Firestore (vehicle JSON documents)
  - CloudWatch (logs)
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone

import boto3

# ─── Logging setup ────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── AWS clients (initialized once per cold start) ───────────────────────────
_secrets = boto3.client("secretsmanager")
_s3 = boto3.client("s3")
_cloudfront = boto3.client("cloudfront")


def get_secret(arn: str) -> str:
    """Fetch a secret value from AWS Secrets Manager."""
    if not arn:
        return ""
    try:
        response = _secrets.get_secret_value(SecretId=arn)
        return response.get("SecretString", "")
    except Exception as e:
        logger.warning(f"Failed to fetch secret {arn}: {e}")
        return ""


def hydrate_environment():
    """Pull API keys from Secrets Manager and inject as env vars (so existing
    scraper code that reads os.environ still works without modification)."""
    if ocm_arn := os.environ.get("OCM_SECRET_ARN"):
        os.environ["OCM_API_KEY"] = get_secret(ocm_arn)
    if nrel_arn := os.environ.get("NREL_SECRET_ARN"):
        os.environ["NREL_API_KEY"] = get_secret(nrel_arn)
    if fb_arn := os.environ.get("FIREBASE_SECRET_ARN"):
        # Write Firebase service-account JSON to /tmp (writable in Lambda)
        sa_json = get_secret(fb_arn)
        if sa_json:
            sa_path = "/tmp/firebase-sa.json"
            with open(sa_path, "w") as f:
                f.write(sa_json)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = sa_path


def invalidate_cdn():
    """Bust the CloudFront image cache after image updates."""
    dist_id = os.environ.get("CDN_DISTRIBUTION")
    if not dist_id:
        return
    try:
        _cloudfront.create_invalidation(
            DistributionId=dist_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/vehicles/*"]},
                "CallerReference": str(datetime.now(timezone.utc).timestamp()),
            },
        )
        logger.info(f"CloudFront invalidation triggered for {dist_id}")
    except Exception as e:
        logger.warning(f"CloudFront invalidation failed: {e}")


def handler(event, context):
    """
    Main Lambda entrypoint.

    Event shapes:
      EventBridge: {"source": "eventbridge-schedule", "refreshAll": true, ...}
      API GW POST: {"requestContext": {"http": {"method": "POST", "path": "/scrape"}}, "body": "{...}"}
      API GW GET:  {"requestContext": {"http": {"method": "GET",  "path": "/status"}}}
    """
    logger.info(f"Event: {json.dumps(event)[:500]}")

    # ── Determine invocation type ──
    is_api_gateway = "requestContext" in event and "http" in event.get("requestContext", {})

    if is_api_gateway:
        method = event["requestContext"]["http"]["method"]
        path = event["requestContext"]["http"]["path"]

        # ── GET /status — return last-run metadata ──
        if method == "GET" and path == "/status":
            return api_response(200, get_status())

        # ── POST /scrape — kick off a scrape ──
        if method == "POST" and path == "/scrape":
            body = json.loads(event.get("body") or "{}")
            return api_response(202, run_scrape(body))

        return api_response(404, {"error": "Not Found"})

    # ── EventBridge invocation ──
    return run_scrape(event)


def get_status() -> dict:
    """Return metadata about the last scraper run (stored in S3)."""
    bucket = os.environ.get("IMAGES_BUCKET")
    if not bucket:
        return {"status": "unknown"}
    try:
        obj = _s3.get_object(Bucket=bucket, Key="meta/last-run.json")
        return json.loads(obj["Body"].read())
    except _s3.exceptions.NoSuchKey:
        return {"status": "never-run"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def run_scrape(payload: dict) -> dict:
    """Execute the scraper. This function imports lazily so the cold-start
    cost is paid only when actually scraping."""
    hydrate_environment()

    logger.info(f"Scrape payload: {payload}")

    # Lazy-import the actual scraper logic — keeps cold starts fast for /status calls
    try:
        from main import run_pipeline
    except ImportError as e:
        logger.error(f"Failed to import scraper main: {e}")
        return {"error": "scraper_import_failed", "detail": str(e)}

    started = datetime.now(timezone.utc)
    try:
        result = run_pipeline(
            brand=payload.get("brand"),
            refresh_all=payload.get("refreshAll", False),
            upload_images=payload.get("uploadImages", True),
            dry_run=payload.get("dryRun", False),
        )
    except Exception as e:
        logger.exception("Scraper failed")
        write_status({"status": "failed", "error": str(e), "startedAt": started.isoformat()})
        return {"error": "scrape_failed", "detail": str(e)}

    finished = datetime.now(timezone.utc)
    status = {
        "status": "ok",
        "startedAt": started.isoformat(),
        "finishedAt": finished.isoformat(),
        "durationSeconds": (finished - started).total_seconds(),
        "vehiclesProcessed": result.get("vehiclesProcessed", 0),
        "imagesUploaded": result.get("imagesUploaded", 0),
        "errors": result.get("errors", []),
    }
    write_status(status)
    invalidate_cdn()
    return status


def write_status(status: dict):
    """Persist last-run metadata to S3 for the GET /status endpoint."""
    bucket = os.environ.get("IMAGES_BUCKET")
    if not bucket:
        return
    try:
        _s3.put_object(
            Bucket=bucket,
            Key="meta/last-run.json",
            Body=json.dumps(status, indent=2),
            ContentType="application/json",
        )
    except Exception as e:
        logger.warning(f"Failed to write status: {e}")


def api_response(status_code: int, body: dict) -> dict:
    """Format a response for API Gateway HTTP API (v2) integration."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
