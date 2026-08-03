# FairProcess 2.0 — Terraform Infrastructure
#
# Production AWS deployment for FairProcess 2.0.
# Uses ECS Fargate for API/Worker, RDS for PostGIS, ElastiCache for caching,
# and S3 for evidence storage.

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ─── Variables ───
variable "aws_region" {
  default = "us-west-1"
}

variable "project_name" {
  default = "fairprocess"
}

variable "environment" {
  default = "production"
}

variable "domain_name" {
  description = "Domain for the web app (e.g. fairprocess.example.com)"
  default     = ""
}

# ─── Provider ───
provider "aws" {
  region = var.aws_region
}

# ─── Common tags ───
locals {
  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─── VPC ───
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = local.tags
}

# ─── RDS PostGIS ───
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = module.vpc.private_subnets
  tags       = local.tags
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "Allow Postgres from ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.project_name}-${var.environment}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.medium"
  allocated_storage      = 100
  storage_encrypted      = true
  db_name                = "fairprocess"
  username               = "fp"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = var.environment == "production" ? false : true
  tags                   = local.tags
}

variable "db_password" {
  sensitive = true
  type      = string
}

# ─── ECS Cluster ───
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"
  tags = local.tags
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Effect = "Allow"
    }]
  })
}

# ─── S3 Evidence Storage ───
resource "aws_s3_bucket" "evidence" {
  bucket = "${var.project_name}-${var.environment}-evidence"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    id     = "transition-to-ia"
    status = "Enabled"
    transition { days = 30 storage_class = "STANDARD_IA" }
  }
}

# ─── Application Load Balancer ───
resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  tags               = local.tags
}

resource "aws_lb_target_group" "api" {
  name     = "${var.project_name}-api"
  port     = 8000
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path = "/health"
    matcher = "200"
    interval = 30
    timeout = 5
  }
}

resource "aws_lb_target_group" "web" {
  name     = "${var.project_name}-web"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path = "/"
    matcher = "200"
    interval = 30
    timeout = 5
  }
}

# ─── Outputs ───
output "rds_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "s3_bucket" {
  value = aws_s3_bucket.evidence.bucket
}

output "alb_dns" {
  value = aws_lb.main.dns_name
}
