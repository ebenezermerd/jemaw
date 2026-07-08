output "aws_region" {
  value = var.aws_region
}

output "ecr_repository_url" {
  value = aws_ecr_repository.bot.repository_url
}

output "bot_service_url" {
  value = "https://${aws_apprunner_service.bot.service_url}"
}

output "mini_app_url" {
  value = local.cloudfront_url
}

output "app_bucket" {
  value = aws_s3_bucket.app.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "database_endpoint" {
  value = aws_db_instance.postgres.address
}

output "database_name" {
  value = var.db_name
}

output "database_username" {
  value = var.db_username
}

output "database_url_secret_arn" {
  value = aws_secretsmanager_secret.database_url.arn
}

output "telegram_bot_token_secret_arn" {
  value = aws_secretsmanager_secret.telegram_bot_token.arn
}
