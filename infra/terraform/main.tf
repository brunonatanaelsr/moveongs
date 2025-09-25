terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.45"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge({
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }, var.tags)
  }
}

locals {
  name = "${var.project}-${var.environment}"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

resource "aws_kms_key" "app" {
  description             = "KMS key for ${local.name} application secrets and data"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EnableRootPermissions"
        Effect   = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowSecretsManagerUseOfKey"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource  = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.aws_region}.amazonaws.com"
          }
        }
      },
      {
        Sid    = "AllowS3UseOfKey"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource  = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "app" {
  name          = "alias/${local.name}-app"
  target_key_id = aws_kms_key.app.key_id
}

locals {
  attachments_bucket_name = lower(replace("${local.name}-attachments", "_", "-"))
}

resource "aws_s3_bucket" "attachments" {
  bucket = local.attachments_bucket_name

  tags = {
    Purpose = "attachments"
  }
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.app.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "attachments_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.attachments.arn,
      "${aws_s3_bucket.attachments.arn}/*"
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "DenyIncorrectEncryptionHeader"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.attachments.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }

  statement {
    sid     = "DenyUnencryptedUploads"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.attachments.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Null"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["true"]
    }
  }
}

resource "aws_s3_bucket_policy" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  policy = data.aws_iam_policy_document.attachments_bucket.json
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.1"

  name = local.name
  cidr = var.vpc_cidr

  azs              = var.availability_zones
  public_subnets   = var.public_subnet_cidrs
  private_subnets  = var.private_subnet_cidrs
  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Security group para o Application Load Balancer"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_service" {
  name        = "${local.name}-ecs"
  description = "Acesso apenas pelo ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  count       = var.create_rds ? 1 : 0
  name        = "${local.name}-db"
  description = "Acesso ao banco vindo da ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  count       = var.create_redis ? 1 : 0
  name        = "${local.name}-redis"
  description = "Acesso ao Redis pela ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.5"
  count   = var.create_rds ? 1 : 0

  identifier = "${local.name}-db"

  engine               = "postgres"
  engine_version       = "15.5"
  instance_class       = var.rds_instance_class
  allocated_storage    = var.rds_allocated_storage
  max_allocated_storage = var.rds_allocated_storage * 2
  multi_az             = var.rds_multi_az

  db_name  = "${replace(local.name, "-", "_")}_db"
  username = var.rds_username
  password = var.rds_password

  create_db_option_group    = false
  create_db_parameter_group = false

  vpc_security_group_ids = [aws_security_group.database[0].id]
  subnet_ids             = module.vpc.private_subnets

  publicly_accessible = false
  storage_encrypted   = true
  skip_final_snapshot = true
}

module "redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 5.4"
  count   = var.create_redis ? 1 : 0

  engine            = "redis"
  engine_version    = "7.0"
  node_type         = var.redis_node_type
  num_cache_nodes   = var.redis_num_cache_nodes
  cluster_id        = "${local.name}-redis"
  subnet_ids        = module.vpc.private_subnets
  security_group_ids = [aws_security_group.redis[0].id]
  parameter_group_name = "default.redis7"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/ecs/${local.name}-api"
  retention_in_days = 30
}

resource "aws_secretsmanager_secret" "jwt" {
  name = "${local.name}-jwt"
  kms_key_id = aws_kms_key.app.arn
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = var.jwt_secret_value
}

locals {
  database_host = var.create_rds ? module.rds[0].db_instance_address : null
  database_port = var.create_rds ? module.rds[0].db_instance_port : 5432
  database_name = var.create_rds ? module.rds[0].db_instance_name : null
  database_url  = var.create_rds ? "postgres://${var.rds_username}:${var.rds_password}@${module.rds[0].db_instance_address}:${module.rds[0].db_instance_port}/${module.rds[0].db_instance_name}" : lookup(var.extra_environment, "DATABASE_URL", null)

  redis_host = var.create_redis ? module.redis[0].primary_endpoint_address : null
  redis_url  = var.create_redis ? "redis://${module.redis[0].primary_endpoint_address}:6379" : lookup(var.extra_environment, "REDIS_URL", null)
}

resource "aws_secretsmanager_secret" "database_url" {
  count = local.database_url != null ? 1 : 0
  name  = "${local.name}-database-url"
  kms_key_id = aws_kms_key.app.arn
}

resource "aws_secretsmanager_secret_version" "database_url" {
  count        = local.database_url != null ? 1 : 0
  secret_id    = aws_secretsmanager_secret.database_url[0].id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "redis_url" {
  count = local.redis_url != null ? 1 : 0
  name  = "${local.name}-redis-url"
  kms_key_id = aws_kms_key.app.arn
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  count        = local.redis_url != null ? 1 : 0
  secret_id    = aws_secretsmanager_secret.redis_url[0].id
  secret_string = local.redis_url
}

locals {
  base_env = {
    NODE_ENV  = "production"
    HOST      = "0.0.0.0"
    PORT      = tostring(var.container_port)
    LOG_LEVEL = "info"
  }

  attachments_env = {
    ATTACHMENTS_STORAGE        = "s3"
    S3_BUCKET                  = aws_s3_bucket.attachments.bucket
    S3_REGION                  = var.aws_region
    S3_SERVER_SIDE_ENCRYPTION  = "aws:kms"
    PII_ENCRYPTION_KMS_KEY_ID  = aws_kms_alias.app.arn
  }

  env_map = merge(local.base_env, local.attachments_env, var.extra_environment)
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

locals {
  secret_arns = concat(
    [aws_secretsmanager_secret.jwt.arn],
    [for secret in aws_secretsmanager_secret.database_url : secret.arn],
    [for secret in aws_secretsmanager_secret.redis_url : secret.arn]
  )
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "${local.name}-execution-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = local.secret_arns
      },
      {
        Effect   = "Allow"
        Action   = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.app.arn
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_data" {
  name = "${local.name}-task-data"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:GetObjectAttributes",
          "s3:GetObjectTagging",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.attachments.arn,
          "${aws_s3_bucket.attachments.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey",
          "kms:GenerateDataKeyWithoutPlaintext"
        ]
        Resource = aws_kms_key.app.arn
      },
      {
        Effect   = "Allow"
        Action   = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = local.secret_arns
      }
    ]
  })
}

resource "aws_ecs_cluster" "this" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

locals {
  container_environment = [
    for key, value in local.env_map : {
      name  = key
      value = value
    }
    if value != null
  ]

  container_secrets = concat(
    [{
      name      = "JWT_SECRET"
      valueFrom = aws_secretsmanager_secret.jwt.arn
    }],
    local.database_url != null ? [{
      name      = "DATABASE_URL"
      valueFrom = aws_secretsmanager_secret.database_url[0].arn
    }] : [],
    local.redis_url != null ? [{
      name      = "REDIS_URL"
      valueFrom = aws_secretsmanager_secret.redis_url[0].arn
    }] : []
  )
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.container_image
      essential = true
      portMappings = [{
        containerPort = var.container_port
        protocol      = "tcp"
      }]
      environment = local.container_environment
      secrets     = local.container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])
}

resource "aws_lb" "this" {
  name               = "${substr(local.name, 0, 18)}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "api" {
  name     = "${substr(local.name, 0, 24)}-tg"
  port     = var.container_port
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200-399"
    healthy_threshold   = 3
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn != null ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.ecs_service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_count
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${local.name}-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

resource "aws_route53_record" "alb" {
  count = var.domain_name != null && var.route53_zone_name != null ? 1 : 0

  name    = var.domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.primary[0].zone_id

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

data "aws_route53_zone" "primary" {
  count = var.domain_name != null && var.route53_zone_name != null ? 1 : 0
  name  = var.route53_zone_name
  private_zone = false
}
