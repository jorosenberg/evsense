#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — full frontend deploy: build the React app and push it (including
# the bundled /data scraped JSON + images) to S3 + CloudFront.
#
# Use this for a code change. For a data-only refresh after running the scraper
# locally, use ./publish-data.sh instead (no rebuild, much faster).
#
# Requires: node/npm, awscli configured, and a prior `terraform apply`.
#
# Usage:
#   cd terraform && ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "${HERE}/../frontend" && pwd)"
cd "$HERE"

command -v aws >/dev/null 2>&1 || { echo "error: awscli not found." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "error: npm not found." >&2; exit 1; }

BUCKET="$(terraform output -raw site_bucket_name 2>/dev/null || true)"
DIST="$(terraform output -raw site_cloudfront_id 2>/dev/null || true)"
case "$BUCKET" in ""|*disabled*)
  echo "error: no site_bucket_name output. Run 'terraform apply' with enable_static_site=true first." >&2
  exit 1 ;;
esac

echo "Building frontend…"
( cd "$FRONTEND" && npm ci && npm run build )

echo "Uploading dist -> s3://${BUCKET}"
# Hashed, immutable build assets: cache forever.
aws s3 sync "${FRONTEND}/dist" "s3://${BUCKET}" --delete \
  --exclude "index.html" --exclude "data/*" \
  --cache-control "public,max-age=31536000,immutable"
# index.html + scraped data: short TTL so updates show quickly.
aws s3 sync "${FRONTEND}/dist" "s3://${BUCKET}" \
  --exclude "*" --include "index.html" --include "data/*" \
  --cache-control "public,max-age=600"

if [ -n "$DIST" ] && [ "${DIST#*disabled}" = "$DIST" ]; then
  echo "Invalidating CloudFront /* on ${DIST}"
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' >/dev/null
fi

echo "Deployed: $(terraform output -raw site_url 2>/dev/null || echo "(see terraform output site_url)")"
