# ─── Project metadata ─────────────────────────────────────────────────────────
variable "domain_name" {
  type        = string
  description = "Custom domain for the site (e.g. evsense.jonahrosenberg.work). Leave empty to use the CloudFront *.cloudfront.net domain."
  default     = ""
}

variable "project_name" {
  type        = string
  description = "Short identifier used as resource name prefix"
  default     = "evsense"
}

variable "environment" {
  type        = string
  description = "Environment name (dev / staging / prod)"
  default     = "prod"
}

variable "aws_region" {
  type        = string
  description = "AWS region — us-east-1 is cheapest + most free-tier services"
  default     = "us-east-1"
}

variable "github_repo_url" {
  type        = string
  description = "Public HTTPS URL of the GitHub repo (only used by EC2 userdata when enable_ec2_frontend = true)"
  default     = ""
}

# ─── Networking ───────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "public_subnet_2_cidr" {
  type    = string
  default = "10.0.2.0/24"
}

variable "private_subnet_1_cidr" {
  type    = string
  default = "10.0.3.0/24"
}

variable "private_subnet_2_cidr" {
  type    = string
  default = "10.0.4.0/24"
}

# ─── Application ports ────────────────────────────────────────────────────────
variable "app_port" {
  type        = number
  description = "Port nginx serves the React app on"
  default     = 80
}

variable "ssh_port" {
  type    = number
  default = 22
}

variable "db_port" {
  type    = number
  default = 5432
}

# ─── Deployment profile (which pieces to provision) ───────────────────────────
# Default = the cheapest, fully free-tier path: a static S3 + CloudFront site,
# with the scraper running in GitHub Actions (free). Turn the others on only if
# you specifically want server-hosted frontend or a cloud-scheduled scraper.
variable "enable_static_site" {
  type        = bool
  description = "Host the built React app on S3 + CloudFront (recommended, free tier)."
  default     = true
}

variable "enable_ec2_frontend" {
  type        = bool
  description = "Serve the app from an always-on EC2 + nginx instead of S3/CloudFront. NOT free: a public IPv4 is ~$3.60/mo and the instance is only free for 12 months."
  default     = false
}

variable "enable_cloud_scraper" {
  type        = bool
  description = "Run the scraper in AWS (Lambda + ECR + API Gateway + EventBridge). Redundant if you use the GitHub Actions pipeline. ECR image storage may exceed the 12-month free tier."
  default     = false
}

# ─── EC2 (only used when enable_ec2_frontend = true) ──────────────────────────
variable "key_name" {
  type        = string
  description = "Name of an existing EC2 SSH key pair. Only needed when enable_ec2_frontend = true."
  default     = ""
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type — t3.micro is free tier eligible (750 hrs/mo, 12 months)"
  default     = "t3.micro"
}

# ─── Database (optional — disabled by default) ────────────────────────────────
variable "enable_rds" {
  type        = bool
  description = "Provision RDS PostgreSQL. EVsense uses static JSON by default; only enable if you want a real DB."
  default     = false
}

variable "db_name" {
  type    = string
  default = "evsensedb"
}

variable "db_username" {
  type    = string
  default = "evsenseadmin"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "RDS master password — at least 8 chars, no @/\"/spaces"
  default     = ""
}

# ─── External API keys (stored in Secrets Manager) ────────────────────────────
variable "ocm_api_key" {
  type        = string
  sensitive   = true
  description = "Open Charge Map API key — get one at openchargemap.org/site/develop/api"
  default     = ""
}

variable "nrel_api_key" {
  type        = string
  sensitive   = true
  description = "NREL Developer API key for AFDC charging-station data — signup.developer.nrel.gov"
  default     = ""
}

# ─── Firebase (used by Lambda to write to Firestore) ──────────────────────────
variable "firebase_service_account_json" {
  type        = string
  sensitive   = true
  description = "Contents of the Firebase service-account JSON file (one-line, escaped)"
  default     = ""
}
