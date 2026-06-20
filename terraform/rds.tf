# ─────────────────────────────────────────────────────────────────────────────
# RDS PostgreSQL — OPTIONAL (default off). EVsense uses static JSON by default.
# Free tier: db.t3.micro + 20 GB gp2 storage + 20 GB backup for 12 months
# Enable by setting `enable_rds = true` in terraform.tfvars
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "default" {
  count      = var.enable_rds ? 1 : 0
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_db_instance" "default" {
  count = var.enable_rds ? 1 : 0

  identifier              = "${var.project_name}-db"
  allocated_storage       = 20
  storage_type            = "gp2"
  storage_encrypted       = true
  engine                  = "postgres"
  engine_version          = "16.3"
  instance_class          = "db.t3.micro" # free tier
  db_name                 = var.db_name
  username                = var.db_username
  password                = var.db_password
  port                    = var.db_port
  parameter_group_name    = "default.postgres16"
  skip_final_snapshot     = true
  publicly_accessible     = true # locked down by SG (web SG only)
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  vpc_security_group_ids = [aws_security_group.db_sg[0].id]
  db_subnet_group_name   = aws_db_subnet_group.default[0].name

  tags = {
    Name = "${var.project_name}-db"
  }
}
