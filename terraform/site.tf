# ─────────────────────────────────────────────────────────────────────────────
# Static site — the React app + its /data/*.json, served from S3 via CloudFront.
# This is the recommended, fully free-tier hosting path (replaces the EC2 server).
# Deploy the build with:  aws s3 sync frontend/dist s3://<site bucket>/ --delete
#
# Free tier: S3 5 GB (12 mo); CloudFront has an ALWAYS-FREE tier of 1 TB egress +
# 10M requests/month. A static EV catalog is a few MB and trivial traffic → $0.
# Gated by `enable_static_site` (default true).
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "site" {
  count  = var.enable_static_site ? 1 : 0
  bucket = "${var.project_name}-site-${random_id.bucket_suffix.hex}"

  tags = {
    Name    = "${var.project_name}-site"
    Purpose = "react-app-static-hosting"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  count  = var.enable_static_site ? 1 : 0
  bucket = aws_s3_bucket.site[0].id

  block_public_acls       = true
  block_public_policy     = false # CloudFront OAC bucket policy needs this
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_cloudfront_origin_access_control" "site_oac" {
  count                             = var.enable_static_site ? 1 : 0
  name                              = "${var.project_name}-site-oac"
  description                       = "OAC for the static site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── ACM certificate (must be us-east-1 for CloudFront) ────────────────────────
resource "aws_acm_certificate" "site" {
  count             = var.domain_name != "" && var.enable_static_site ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# Polls until the cert is issued. Add the DNS CNAME from outputs before applying.
resource "aws_acm_certificate_validation" "site" {
  count           = var.domain_name != "" && var.enable_static_site ? 1 : 0
  certificate_arn = aws_acm_certificate.site[0].arn
  timeouts {
    create = "45m"
  }
}

resource "aws_cloudfront_distribution" "site" {
  count               = var.enable_static_site ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.project_name} static site"
  price_class         = "PriceClass_100" # US/CA/EU — cheapest
  aliases             = var.domain_name != "" ? [var.domain_name] : []

  origin {
    domain_name              = aws_s3_bucket.site[0].bucket_regional_domain_name
    origin_id                = "s3-site-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.site_oac[0].id
  }

  default_cache_behavior {
    target_origin_id       = "s3-site-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # SPA routing: serve index.html for client-side routes (404/403 → app shell).
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == ""
    acm_certificate_arn            = var.domain_name != "" ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = var.domain_name != "" ? "sni-only" : null
    minimum_protocol_version       = var.domain_name != "" ? "TLSv1.2_2021" : null
  }

  depends_on = [aws_acm_certificate_validation.site]

  tags = {
    Name = "${var.project_name}-site-cdn"
  }
}

data "aws_iam_policy_document" "site_bucket_policy" {
  count = var.enable_static_site ? 1 : 0
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site[0].arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  count  = var.enable_static_site ? 1 : 0
  bucket = aws_s3_bucket.site[0].id
  policy = data.aws_iam_policy_document.site_bucket_policy[0].json
}
