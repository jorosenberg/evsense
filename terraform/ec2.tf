# ─────────────────────────────────────────────────────────────────────────────
# EC2 — t3.micro free tier instance serving the React build via nginx
# ─────────────────────────────────────────────────────────────────────────────

# Latest Ubuntu 22.04 LTS AMI (Canonical) — pinning prevents drift, but using
# a data source means we always get current security patches.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "web_server" {
  count                  = var.enable_ec2_frontend ? 1 : 0
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  key_name = var.key_name

  # 8 GB gp3 root volume (free tier covers 30 GB EBS aggregate)
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/userdata/user_data.sh.tpl", {
    github_repo_url  = var.github_repo_url
    project_name     = var.project_name
    aws_region       = var.aws_region
    app_port         = var.app_port
    artifacts_bucket = aws_s3_bucket.artifacts.id
    images_cdn_url   = "https://${aws_cloudfront_distribution.images.domain_name}"
    db_host          = var.enable_rds ? aws_db_instance.default[0].address : ""
    db_name          = var.db_name
    db_user          = var.db_username
    enable_rds       = var.enable_rds
  })

  # Replace the instance if userdata changes
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-web"
    Role = "frontend-server"
  }
}

# Elastic IP — stable DNS while iterating. NOTE: since Feb 2024 AWS charges for
# every public IPv4 (~$3.60/mo) whether or not it's attached, so this is a real
# cost. Only created when the EC2 frontend is enabled.
resource "aws_eip" "web_eip" {
  count    = var.enable_ec2_frontend ? 1 : 0
  domain   = "vpc"
  instance = aws_instance.web_server[0].id

  tags = {
    Name = "${var.project_name}-eip"
  }
}
