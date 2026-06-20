# ─────────────────────────────────────────────────────────────────────────────
# EventBridge — monthly schedule that triggers the scraper Lambda
# Free tier: 14M events/month for first 12 months
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "monthly_scrape" {
  count               = var.enable_cloud_scraper ? 1 : 0
  name                = "${var.project_name}-monthly-scrape"
  description         = "Trigger the EVsense scraper on the 1st of every month at 06:00 UTC"
  schedule_expression = "cron(0 6 1 * ? *)"
}

resource "aws_cloudwatch_event_target" "scraper_target" {
  count     = var.enable_cloud_scraper ? 1 : 0
  rule      = aws_cloudwatch_event_rule.monthly_scrape[0].name
  target_id = "scraper-lambda"
  arn       = aws_lambda_function.scraper[0].arn

  input = jsonencode({
    source       = "eventbridge-schedule"
    refreshAll   = true
    uploadImages = true
  })
}

resource "aws_lambda_permission" "allow_eventbridge" {
  count         = var.enable_cloud_scraper ? 1 : 0
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scraper[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_scrape[0].arn
}
