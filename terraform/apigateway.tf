# ─────────────────────────────────────────────────────────────────────────────
# API Gateway — HTTP endpoint to manually trigger the scraper
# Free tier: 1M API calls/month for first 12 months (HTTP API only)
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "scraper_api" {
  count         = var.enable_cloud_scraper ? 1 : 0
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "Public API for triggering EVsense scraper + future endpoints"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "scraper_integration" {
  count                  = var.enable_cloud_scraper ? 1 : 0
  api_id                 = aws_apigatewayv2_api.scraper_api[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.scraper[0].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "scrape_route" {
  count     = var.enable_cloud_scraper ? 1 : 0
  api_id    = aws_apigatewayv2_api.scraper_api[0].id
  route_key = "POST /scrape"
  target    = "integrations/${aws_apigatewayv2_integration.scraper_integration[0].id}"
}

# Status route — Lambda returns last-run metadata
resource "aws_apigatewayv2_route" "status_route" {
  count     = var.enable_cloud_scraper ? 1 : 0
  api_id    = aws_apigatewayv2_api.scraper_api[0].id
  route_key = "GET /status"
  target    = "integrations/${aws_apigatewayv2_integration.scraper_integration[0].id}"
}

resource "aws_apigatewayv2_stage" "default" {
  count       = var.enable_cloud_scraper ? 1 : 0
  api_id      = aws_apigatewayv2_api.scraper_api[0].id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }
}

resource "aws_lambda_permission" "allow_api_gateway" {
  count         = var.enable_cloud_scraper ? 1 : 0
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scraper[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.scraper_api[0].execution_arn}/*/*"
}
