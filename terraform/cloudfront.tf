# ─────────────────────────────────────────────────────────────────────────────
# CloudFront — CDN in front of the S3 images bucket
# Free tier: 1 TB egress + 10M req/month for first 12 months (then ~$0.085/GB)
# ─────────────────────────────────────────────────────────────────────────────

# Origin Access Control — secure way for CloudFront to read private S3 bucket
resource "aws_cloudfront_origin_access_control" "images_oac" {
  name                              = "${var.project_name}-images-oac"
  description                       = "OAC for images bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "images" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""
  comment             = "${var.project_name} vehicle images CDN"
  # PriceClass_100 = US/Canada/Europe only — cheapest tier
  price_class = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.images.bucket_regional_domain_name
    origin_id                = "s3-images-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.images_oac.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-images-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Use AWS-managed cache policy "CachingOptimized"
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-images-cdn"
  }
}

# CORS response headers policy (so images load cleanly from any origin)
resource "aws_cloudfront_response_headers_policy" "cors" {
  name = "${var.project_name}-cors-headers"

  cors_config {
    access_control_allow_credentials = false
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = ["*"]
    }
    access_control_allow_headers {
      items = ["*"]
    }
    access_control_max_age_sec = 3600
    origin_override            = true
  }
}

# ── S3 bucket policy granting CloudFront OAC read access ──────────────────────
data "aws_iam_policy_document" "images_bucket_policy" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.images.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.images.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = data.aws_iam_policy_document.images_bucket_policy.json
}
