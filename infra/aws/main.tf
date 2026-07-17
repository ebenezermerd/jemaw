locals {
  name_prefix     = "${var.project_name}-${var.environment}"
  bot_port        = 8080
  app_bucket_name = "${local.name_prefix}-app-${data.aws_caller_identity.current.account_id}"
  bot_image       = "${aws_ecr_repository.bot.repository_url}:${var.image_tag}"
  bot_api_url     = "https://${aws_cloudfront_distribution.bot_api.domain_name}"
  cloudfront_url  = "https://${aws_cloudfront_distribution.app.domain_name}"
  database_url    = "postgres://${var.db_username}:${urlencode(random_password.db.result)}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}?sslmode=require"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${count.index + 1}"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_ecr_repository" "bot" {
  name                 = "${local.name_prefix}-bot"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "bot" {
  repository = aws_ecr_repository.bot.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 10 bot images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public HTTP access for Jemaw bot ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "Jemaw bot ECS service"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = local.bot_port
    to_port         = local.bot_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db"
  description = "Postgres access for Jemaw"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ECS to Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  ingress {
    description = "Admin restore from local workstation"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.allowed_admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name_prefix}-postgres"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  storage_type                 = "gp3"
  db_name                      = var.db_name
  username                     = var.db_username
  password                     = random_password.db.result
  db_subnet_group_name         = aws_db_subnet_group.postgres.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  publicly_accessible          = true
  backup_retention_period      = 0
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name_prefix}-postgres-final"
  auto_minor_version_upgrade   = true
  apply_immediately            = true
  performance_insights_enabled = false

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name_prefix}/database-url"
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "telegram_bot_token" {
  name = "${local.name_prefix}/telegram-bot-token"
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "telegram_bot_token" {
  secret_id     = aws_secretsmanager_secret.telegram_bot_token.id
  secret_string = var.telegram_bot_token
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  count = var.gemini_api_key == "" ? 0 : 1
  name  = "${local.name_prefix}/gemini-api-key"
  tags  = local.common_tags
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  count         = var.gemini_api_key == "" ? 0 : 1
  secret_id     = aws_secretsmanager_secret.gemini_api_key[0].id
  secret_string = var.gemini_api_key
}

resource "aws_secretsmanager_secret" "groq_api_key" {
  count = var.groq_api_key == "" ? 0 : 1
  name  = "${local.name_prefix}/groq-api-key"
  tags  = local.common_tags
}

resource "aws_secretsmanager_secret_version" "groq_api_key" {
  count         = var.groq_api_key == "" ? 0 : 1
  secret_id     = aws_secretsmanager_secret.groq_api_key[0].id
  secret_string = var.groq_api_key
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "${local.name_prefix}-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = compact([
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.telegram_bot_token.arn,
          try(aws_secretsmanager_secret.gemini_api_key[0].arn, ""),
          try(aws_secretsmanager_secret.groq_api_key[0].arn, "")
        ])
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "bot" {
  name              = "/ecs/${local.name_prefix}-bot"
  retention_in_days = 7

  tags = local.common_tags
}

resource "aws_lb" "bot" {
  name               = "${local.name_prefix}-bot"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_lb_target_group" "bot" {
  name        = "${local.name_prefix}-bot"
  port        = local.bot_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "bot" {
  load_balancer_arn = aws_lb.bot.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.bot.arn
  }
}

resource "aws_ecs_cluster" "bot" {
  name = "${local.name_prefix}-bot"

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "bot" {
  family                   = "${local.name_prefix}-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "bot"
      image     = local.bot_image
      essential = true

      portMappings = [
        {
          containerPort = local.bot_port
          protocol      = "tcp"
        }
      ]

      environment = concat([
        { name = "NODE_ENV", value = "production" },
        { name = "BOT_MODE", value = "webhook" },
        { name = "WEBHOOK_URL", value = "${local.bot_api_url}/telegram/webhook" },
        { name = "REGISTER_TELEGRAM_WEBHOOK", value = "false" },
        { name = "MINI_APP_URL", value = local.cloudfront_url },
        { name = "CORS_EXTRA_ORIGINS", value = "https://jemaw-498106.web.app" },
        { name = "BOT_USERNAME", value = var.bot_username },
        { name = "MINI_APP_SHORT_NAME", value = var.mini_app_short_name }
      ], var.groq_model == "" ? [] : [{ name = "GROQ_MODEL", value = var.groq_model }])

      secrets = concat([
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "TELEGRAM_BOT_TOKEN", valueFrom = aws_secretsmanager_secret.telegram_bot_token.arn }
        ],
        var.gemini_api_key == "" ? [] : [{ name = "GEMINI_API_KEY", valueFrom = aws_secretsmanager_secret.gemini_api_key[0].arn }],
      var.groq_api_key == "" ? [] : [{ name = "GROQ_API_KEY", valueFrom = aws_secretsmanager_secret.groq_api_key[0].arn }])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.bot.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "bot"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "bot" {
  name            = "${local.name_prefix}-bot"
  cluster         = aws_ecs_cluster.bot.id
  task_definition = aws_ecs_task_definition.bot.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.bot.arn
    container_name   = "bot"
    container_port   = local.bot_port
  }

  depends_on = [aws_lb_listener.bot]

  tags = local.common_tags
}

resource "aws_s3_bucket" "app" {
  bucket = local.app_bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "app" {
  name                              = "${local.name_prefix}-app"
  description                       = "CloudFront access to Jemaw Mini App bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} Telegram Mini App"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.app.bucket_regional_domain_name
    origin_id                = "s3-app"
    origin_access_control_id = aws_cloudfront_origin_access_control.app.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-app"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = "s3-app"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    min_ttl                = 31536000
    default_ttl            = 31536000
    max_ttl                = 31536000

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.common_tags
}

resource "aws_cloudfront_distribution" "bot_api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix} bot API"
  price_class     = "PriceClass_100"

  origin {
    domain_name = aws_lb.bot.dns_name
    origin_id   = "alb-bot-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb-bot-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "X-Telegram-Init-Data"]

      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "app_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = data.aws_iam_policy_document.app_bucket.json
}
