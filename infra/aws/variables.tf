variable "project_name" {
  description = "Short name used for AWS resource names."
  type        = string
  default     = "jemaw"
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "image_tag" {
  description = "Bot image tag to deploy from ECR."
  type        = string
  default     = "latest"
}

variable "allowed_admin_cidr" {
  description = "CIDR allowed to connect directly to RDS for one-time restore and administration."
  type        = string
}

variable "telegram_bot_token" {
  description = "Telegram bot token stored in AWS Secrets Manager."
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Optional Gemini API key stored in AWS Secrets Manager."
  type        = string
  sensitive   = true
  default     = ""
}

variable "groq_api_key" {
  description = "Optional Groq API key stored in AWS Secrets Manager."
  type        = string
  sensitive   = true
  default     = ""
}

variable "groq_model" {
  description = "Optional Groq model override."
  type        = string
  default     = ""
}

variable "bot_username" {
  description = "Telegram bot username used to build Mini App deep links."
  type        = string
  default     = "jemawsbot"
}

variable "mini_app_short_name" {
  description = "Telegram Mini App short name from BotFather."
  type        = string
  default     = "app"
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "jemaw"
}

variable "db_username" {
  description = "Application database username."
  type        = string
  default     = "jemaw"
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the smallest Graviton class commonly available."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated RDS storage in GB."
  type        = number
  default     = 20
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated Jemaw VPC."
  type        = string
  default     = "10.42.0.0/16"
}
