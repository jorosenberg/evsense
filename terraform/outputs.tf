# ─────────────────────────────────────────────────────────────────────────────
# Outputs — useful URLs and IDs surfaced after `terraform apply`.
# All server/scraper outputs are conditional so a default (static-only) apply
# returns cleanly without provisioning EC2/Lambda/API Gateway.
# ─────────────────────────────────────────────────────────────────────────────

# ── Primary site URL (static S3+CloudFront, or EC2 if that's enabled) ─────────
output "site_url" {
  description = "Public URL of the app"
  value = (
    var.enable_static_site && var.domain_name != "" ? "https://${var.domain_name}" :
    var.enable_static_site ? "https://${aws_cloudfront_distribution.site[0].domain_name}" :
    var.enable_ec2_frontend ? "http://${aws_eip.web_eip[0].public_ip}" :
    "no frontend enabled"
  )
}

output "cloudfront_domain" {
  description = "CloudFront *.cloudfront.net domain — point your DNS CNAME here"
  value       = var.enable_static_site ? aws_cloudfront_distribution.site[0].domain_name : "static site disabled"
}

output "acm_validation_cnames" {
  description = "Step 1: add these DNS records to validate your ACM certificate, then re-run terraform apply"
  value = var.domain_name != "" && var.enable_static_site ? {
    for dvo in aws_acm_certificate.site[0].domain_validation_options : dvo.domain_name => {
      record_name  = dvo.resource_record_name
      record_value = dvo.resource_record_value
      record_type  = dvo.resource_record_type
    }
  } : {}
}

output "site_bucket_name" {
  description = "S3 bucket to deploy the React build into (aws s3 sync frontend/dist s3://<this>/)"
  value       = var.enable_static_site ? aws_s3_bucket.site[0].id : "static site disabled"
}

output "site_cloudfront_id" {
  description = "CloudFront distribution ID for the site (use for cache invalidations)"
  value       = var.enable_static_site ? aws_cloudfront_distribution.site[0].id : "static site disabled"
}

# ── EC2 frontend (only when enable_ec2_frontend = true) ───────────────────────
output "ec2_public_ip" {
  description = "Elastic IP attached to the web server"
  value       = var.enable_ec2_frontend ? aws_eip.web_eip[0].public_ip : "ec2 frontend disabled"
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = var.enable_ec2_frontend ? aws_instance.web_server[0].id : "ec2 frontend disabled"
}

output "ssh_command" {
  description = "SSH into the web server (replace <key.pem> with your private key path)"
  value       = var.enable_ec2_frontend ? "ssh -i <key.pem> ubuntu@${aws_eip.web_eip[0].public_ip}" : "ec2 frontend disabled"
}

# ── Cloud scraper (only when enable_cloud_scraper = true) ─────────────────────
output "api_endpoint" {
  description = "Base URL of the API Gateway"
  value       = var.enable_cloud_scraper ? aws_apigatewayv2_api.scraper_api[0].api_endpoint : "cloud scraper disabled"
}

output "scrape_url" {
  description = "POST URL to manually trigger the scraper"
  value       = var.enable_cloud_scraper ? "${aws_apigatewayv2_api.scraper_api[0].api_endpoint}/scrape" : "cloud scraper disabled"
}

output "ecr_repository_url" {
  description = "ECR URL for the scraper container image"
  value       = var.enable_cloud_scraper ? aws_ecr_repository.scraper[0].repository_url : "cloud scraper disabled"
}

output "lambda_function_name" {
  description = "Name of the scraper Lambda function"
  value       = var.enable_cloud_scraper ? aws_lambda_function.scraper[0].function_name : "cloud scraper disabled"
}

# ── Always-on (free tier): vehicle images CDN ─────────────────────────────────
output "images_cdn_url" {
  description = "CloudFront URL for vehicle images"
  value       = "https://${aws_cloudfront_distribution.images.domain_name}"
}

output "images_bucket_name" {
  description = "S3 bucket holding vehicle images"
  value       = aws_s3_bucket.images.id
}

output "artifacts_bucket_name" {
  description = "S3 bucket holding React build artifacts (used by the EC2 path)"
  value       = aws_s3_bucket.artifacts.id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (empty when RDS is disabled)"
  value       = var.enable_rds ? aws_db_instance.default[0].address : "disabled"
}
