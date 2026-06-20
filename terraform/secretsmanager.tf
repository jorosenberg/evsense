# ─────────────────────────────────────────────────────────────────────────────
# SSM Parameter Store (SecureString) — free-tier replacement for Secrets Manager
#
# Standard SSM parameters (up to 4 KB) are free. SecureString uses the default
# AWS-managed KMS key (also free) for encryption-at-rest. We picked this over
# Secrets Manager ($0.40/secret/month) per the project's free-tier mandate.
#
# Filename retained as "secretsmanager.tf" purely to keep Terraform state happy
# on existing deployments. Resource keys (ocm_api_key, nrel_api_key, etc.) are
# preserved so downstream references in lambda.tf / iam.tf / ec2.tf don't need
# to change beyond swapping `aws_secretsmanager_secret` → `aws_ssm_parameter`
# and `.arn` lookups, which is handled in those files.
#
# All three scraper secrets below are consumed ONLY by the cloud-scraper Lambda,
# so they are gated behind `enable_cloud_scraper`. The default (static-site-only)
# apply therefore creates ZERO parameters — the frontend reads static JSON from
# S3/CloudFront and needs no server-side keys. Firebase in particular is now an
# OPTIONAL fallback: the app loads /data/vehicles/<id>.json first (see
# frontend/src/hooks/useVehicleDetail.js) and only touches Firestore if a
# VITE_FIREBASE_CONFIG build var is set. Leave enable_cloud_scraper off unless
# you run the scraper in AWS instead of GitHub Actions.
# ─────────────────────────────────────────────────────────────────────────────

resource "random_id" "secret_suffix" {
  byte_length = 4
}

# ── Open Charge Map API key ───────────────────────────────────────────────────
resource "aws_ssm_parameter" "ocm_api_key" {
  count       = var.enable_cloud_scraper ? 1 : 0
  name        = "/${var.project_name}/ocm-api-key-${random_id.secret_suffix.hex}"
  description = "Open Charge Map API key for nearby-charger lookups"
  type        = "SecureString"
  value       = var.ocm_api_key != "" ? var.ocm_api_key : "REPLACE_ME"

  lifecycle {
    # Don't overwrite the value if someone updates it out-of-band via the console
    ignore_changes = [value]
  }
}

# ── NREL Developer API key ────────────────────────────────────────────────────
resource "aws_ssm_parameter" "nrel_api_key" {
  count       = var.enable_cloud_scraper ? 1 : 0
  name        = "/${var.project_name}/nrel-api-key-${random_id.secret_suffix.hex}"
  description = "NREL Developer API key for AFDC station data"
  type        = "SecureString"
  value       = var.nrel_api_key != "" ? var.nrel_api_key : "REPLACE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}

# ── Firebase Service Account JSON (optional — scraper → Firestore writes) ──────
# Only needed if you run the cloud scraper AND want it to mirror data into
# Firestore. The static app does not require this.
resource "aws_ssm_parameter" "firebase_sa" {
  count       = var.enable_cloud_scraper ? 1 : 0
  name        = "/${var.project_name}/firebase-sa-${random_id.secret_suffix.hex}"
  description = "Firebase service-account JSON (Admin SDK)"
  type        = "SecureString"
  value       = var.firebase_service_account_json != "" ? var.firebase_service_account_json : "REPLACE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}

# ── DB password (only if RDS enabled) ─────────────────────────────────────────
resource "aws_ssm_parameter" "db_password" {
  count       = var.enable_rds ? 1 : 0
  name        = "/${var.project_name}/db-password-${random_id.secret_suffix.hex}"
  description = "RDS PostgreSQL master password"
  type        = "SecureString"
  value       = var.db_password != "" ? var.db_password : "REPLACE_ME"

  lifecycle {
    ignore_changes = [value]
  }
}
