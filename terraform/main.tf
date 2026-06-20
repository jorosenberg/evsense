# ─────────────────────────────────────────────────────────────────────────────
# EVsense — Terraform Root Configuration
#
# DEFAULT (free-tier) architecture — see COST.md (≈ $0/month):
#   - Frontend: React build on S3 + CloudFront        (enable_static_site, default ON)
#   - Scraper:  GitHub Actions → commits static JSON   (no AWS resources)
#   - Images:   S3 bucket served via CloudFront
#   - State:    S3 backend with DynamoDB locking
#
# OPTIONAL add-ons, all default OFF (see variables.tf / COST.md):
#   - enable_ec2_frontend   EC2 + nginx frontend       (NOT free: ~$3.60/mo IPv4)
#   - enable_cloud_scraper  Lambda + ECR + API GW + EventBridge
#   - enable_rds            RDS PostgreSQL (db.t3.micro)
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # ── Remote state backend ──
  # Pre-requisite: create the S3 bucket + DynamoDB table manually before first apply.
  # See terraform/README.md for the bootstrap commands.
  backend "s3" {
    bucket         = "evsense-tf-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "evsense-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}
