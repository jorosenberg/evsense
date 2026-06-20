# ─────────────────────────────────────────────────────────────────────────────
# S3 — two buckets
#   1. images:    vehicle images served via CloudFront
#   2. artifacts: React build tarballs pushed from CI and pulled by EC2
# Free tier: 5 GB storage + 20k GET + 2k PUT requests/month for 12 months
# ─────────────────────────────────────────────────────────────────────────────

# Random suffix to ensure global bucket name uniqueness
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# ── Images bucket (public-read via CloudFront only) ───────────────────────────
resource "aws_s3_bucket" "images" {
  bucket = "${var.project_name}-images-${random_id.bucket_suffix.hex}"

  tags = {
    Name    = "${var.project_name}-images"
    Purpose = "vehicle-images-cdn"
  }
}

resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = false # CloudFront OAC needs bucket policy
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# Lifecycle: clean up old versions after 30 days to control costs
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# ── Build artifacts bucket ────────────────────────────────────────────────────
resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.project_name}-artifacts-${random_id.bucket_suffix.hex}"

  tags = {
    Name    = "${var.project_name}-artifacts"
    Purpose = "react-build-tarballs"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: only keep the last 10 builds to stay under free tier
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-old-builds"
    status = "Enabled"

    filter {
      prefix = "frontend/builds/"
    }

    expiration {
      days = 30
    }
  }
}
