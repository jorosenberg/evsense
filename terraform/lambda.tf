# ─────────────────────────────────────────────────────────────────────────────
# Lambda — Python scraper packaged as a container image
# Free tier: 1M requests + 400,000 GB-seconds compute / month (no expiration)
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "scraper" {
  count         = var.enable_cloud_scraper ? 1 : 0
  function_name = "${var.project_name}-scraper"
  role          = aws_iam_role.iam_for_lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.scraper[0].repository_url}:latest"
  timeout       = 900  # 15 min max — long enough for scraping all 30 vehicles
  memory_size   = 1024 # MB

  environment {
    variables = {
      PROJECT_NAME        = var.project_name
      AWS_REGION_NAME     = var.aws_region # AWS_REGION is reserved by Lambda runtime
      IMAGES_BUCKET       = aws_s3_bucket.images.id
      CDN_DISTRIBUTION    = aws_cloudfront_distribution.images.id
      # Free-tier SSM Parameter Store ARNs (swapped from Secrets Manager).
      # The scraper container reads these via the AWS SDK's
      # ssm:GetParameter call with WithDecryption=true.
      OCM_PARAM_NAME      = aws_ssm_parameter.ocm_api_key[0].name
      NREL_PARAM_NAME     = aws_ssm_parameter.nrel_api_key[0].name
      FIREBASE_PARAM_NAME = aws_ssm_parameter.firebase_sa[0].name
      OCM_PARAM_ARN       = aws_ssm_parameter.ocm_api_key[0].arn
      NREL_PARAM_ARN      = aws_ssm_parameter.nrel_api_key[0].arn
      FIREBASE_PARAM_ARN  = aws_ssm_parameter.firebase_sa[0].arn
    }
  }

  # Avoid drift when CI updates the image — Terraform doesn't touch it
  lifecycle {
    ignore_changes = [image_uri]
  }

  tags = {
    Name = "${var.project_name}-scraper"
  }

  # Wait for ECR to exist before creating Lambda
  depends_on = [aws_ecr_repository.scraper]
}

resource "aws_cloudwatch_log_group" "scraper" {
  count             = var.enable_cloud_scraper ? 1 : 0
  name              = "/aws/lambda/${var.project_name}-scraper"
  retention_in_days = 14
}
