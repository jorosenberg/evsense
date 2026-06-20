#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EVsense EC2 bootstrap script
# - Installs nginx + AWS CLI + Node 20
# - Pulls the latest React build artifact from S3
# - Configures nginx to serve the SPA with proper routing fallback
# - Writes runtime config files for the React app
# ─────────────────────────────────────────────────────────────────────────────
set -ex
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

echo "──────────────────────────────────────────────────────"
echo "  EVsense bootstrap — $(date -u)"
echo "──────────────────────────────────────────────────────"

# ── Variables interpolated by Terraform templatefile() ──
REPO_URL="${github_repo_url}"
PROJECT_NAME="${project_name}"
AWS_REGION="${aws_region}"
APP_PORT="${app_port}"
ARTIFACTS_BUCKET="${artifacts_bucket}"
IMAGES_CDN_URL="${images_cdn_url}"
DB_HOST="${db_host}"
DB_NAME="${db_name}"
DB_USER="${db_user}"
ENABLE_RDS="${enable_rds}"

WEB_ROOT="/var/www/evsense"
APP_DIR="/home/ubuntu/app"

# ── System update + packages ──
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git curl unzip jq awscli

systemctl enable nginx
systemctl start nginx

# ── Install Node 20 (for fallback build on EC2 if S3 artifact unavailable) ──
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── Prepare web root ──
mkdir -p "$WEB_ROOT"
chown -R www-data:www-data "$WEB_ROOT"

# ── Try to download latest React build artifact from S3 ──
ARTIFACT_PATH="s3://$ARTIFACTS_BUCKET/frontend/latest.tar.gz"
echo "Checking for build artifact at: $ARTIFACT_PATH"

if aws s3 ls "$ARTIFACT_PATH" --region "$AWS_REGION" > /dev/null 2>&1; then
  echo "✓ Found artifact — extracting"
  aws s3 cp "$ARTIFACT_PATH" /tmp/frontend.tar.gz --region "$AWS_REGION"
  tar -xzf /tmp/frontend.tar.gz -C "$WEB_ROOT" --strip-components=1
  chown -R www-data:www-data "$WEB_ROOT"
  echo "✓ Artifact extracted to $WEB_ROOT"
else
  echo "⚠ No S3 artifact found — falling back to git clone + build"
  mkdir -p "$APP_DIR"

  sudo -u ubuntu -i bash <<EOF
    cd $APP_DIR
    git clone "$REPO_URL" . || true
    cd frontend
    npm ci --no-audit --no-fund
    npm run build
EOF

  cp -r "$APP_DIR/frontend/dist/"* "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"
fi

# ── Write runtime config so the React app knows the image CDN ──
cat <<EOF > "$WEB_ROOT/runtime-config.js"
window.__EVSENSE_CONFIG__ = {
  imagesCdnUrl: "$IMAGES_CDN_URL",
  apiRegion: "$AWS_REGION",
  builtAt: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
};
EOF

# ── Configure nginx ──
cat <<'NGINX_CONF' > /etc/nginx/sites-available/evsense
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;
    root /var/www/evsense;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               application/wasm image/svg+xml;

    # Cache hashed assets aggressively
    location ~* \.(js|css|woff2|woff|ttf|webp|png|jpg|jpeg|gif|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # JSON data — short cache so monthly scraper updates propagate
    location /data/ {
        expires 1h;
        add_header Cache-Control "public, max-age=3600, stale-while-revalidate=86400";
        try_files $uri =404;
    }

    # SPA fallback — every other route serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check for ALB/uptime monitoring
    location = /healthz {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/evsense /etc/nginx/sites-enabled/evsense
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl reload nginx

# ── (Optional) Wait for RDS to be reachable ──
if [ "$ENABLE_RDS" = "true" ] && [ -n "$DB_HOST" ]; then
  echo "RDS enabled — testing connectivity to $DB_HOST"
  apt-get install -y postgresql-client
  for i in {1..30}; do
    if pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME"; then
      echo "✓ RDS reachable"
      break
    fi
    echo "  ... retrying ($i/30)"
    sleep 5
  done
fi

echo "──────────────────────────────────────────────────────"
echo "  EVsense bootstrap completed at $(date -u)"
echo "  Site available at: http://$(curl -s ifconfig.me):$APP_PORT"
echo "──────────────────────────────────────────────────────"
