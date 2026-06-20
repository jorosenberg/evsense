#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# publish-data.sh — push LOCALLY-SCRAPED data to the live site, no rebuild.
#
# After you run the scraper on your laptop (see scraper/LOCAL_PIPELINE.md), the
# fresh JSON + images land in frontend/public/data/. This script uploads just
# that folder to the S3 site bucket's /data/ prefix and invalidates the matching
# CloudFront paths — so a catalog/incentive/lease refresh goes live in seconds
# without a full `npm run build` + redeploy.
#
# Requires: awscli configured, and a `terraform apply` has been run (so the
# `site_bucket_name` / `site_cloudfront_id` outputs exist).
#
# Usage:
#   cd terraform && ./publish-data.sh                 # sync + invalidate
#   DRY_RUN=1 ./publish-data.sh                        # show what would change
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "${HERE}/../frontend/public/data" && pwd)"
cd "$HERE"

if ! command -v aws >/dev/null 2>&1; then
  echo "error: awscli not found on PATH." >&2; exit 1
fi
[ -d "$DATA_DIR" ] || { echo "error: data dir not found: $DATA_DIR" >&2; exit 1; }

BUCKET="$(terraform output -raw site_bucket_name 2>/dev/null || true)"
DIST="$(terraform output -raw site_cloudfront_id 2>/dev/null || true)"
case "$BUCKET" in ""|*disabled*)
  echo "error: no site_bucket_name output. Run 'terraform apply' with enable_static_site=true first." >&2
  exit 1 ;;
esac

DRY=""
[ "${DRY_RUN:-0}" = "1" ] && DRY="--dryrun"

echo "Publishing  $DATA_DIR"
echo "        ->  s3://${BUCKET}/data"

# Static catalog data — short TTL so a refresh shows quickly; --delete prunes
# files removed locally (e.g. dropped trims). CloudFront invalidation below makes
# it immediate regardless of TTL.
aws s3 sync "$DATA_DIR" "s3://${BUCKET}/data" --delete $DRY \
  --cache-control "public,max-age=600"

if [ -n "$DIST" ] && [ "${DIST#*disabled}" = "$DIST" ] && [ "${DRY_RUN:-0}" != "1" ]; then
  echo "Invalidating CloudFront /data/* on ${DIST}"
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/data/*' >/dev/null
fi

echo "Done."
