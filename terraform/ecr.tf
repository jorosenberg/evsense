# ─────────────────────────────────────────────────────────────────────────────
# ECR — private container registry for the scraper Lambda image
# Free tier: 500 MB storage/month for 12 months
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "scraper" {
  count                = var.enable_cloud_scraper ? 1 : 0
  name                 = "${var.project_name}-scraper"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # allow destroy without manually emptying

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-scraper"
  }
}

# Keep only the 5 most recent images to stay under free tier
resource "aws_ecr_lifecycle_policy" "scraper" {
  count      = var.enable_cloud_scraper ? 1 : 0
  repository = aws_ecr_repository.scraper[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only 5 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
