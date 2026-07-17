# Deploying Jemaw on AWS

AWS replacement for the old GCP/Firebase setup:

- Bot/API: ECS Fargate from an ECR image, behind an ALB and CloudFront HTTPS endpoint
- Postgres: RDS PostgreSQL 16
- Secrets: AWS Secrets Manager
- Mini App: S3 private bucket served by CloudFront
- Region: `eu-north-1`

## 1. Prerequisites

```bash
brew install awscli opentofu
aws configure sso # or aws configure with an IAM access key
aws sts get-caller-identity
```

## 2. Create AWS config

```bash
cp infra/aws/terraform.tfvars.example infra/aws/terraform.tfvars
chmod 600 infra/aws/terraform.tfvars
```

Fill `infra/aws/terraform.tfvars` with:

- `allowed_admin_cidr`: your current public IP as `/32`
- `telegram_bot_token`

**Do not put AI API keys in tfvars or any tracked file.** Store them only in AWS Secrets Manager:

```bash
# Interactive (prompts, no echo) — preferred
./scripts/aws-set-ai-keys.sh --prompt

# Or from env vars in your shell only (never commit):
export GEMINI_API_KEY='...'
export GROQ_API_KEY='...'
./scripts/aws-set-ai-keys.sh
```

That script writes `jemaw-prod/gemini-api-key` and `jemaw-prod/groq-api-key`, grants the ECS task execution role access, and redeploys the bot. Success log line: `[scan] using Groq (Gemini fallback)`.

## 3. Provision AWS and deploy the bot image

```bash
./scripts/aws-bootstrap.sh
```

The script:

1. Creates the ECR repository first.
2. Builds `packages/bot/Dockerfile`.
3. Pushes `:latest`.
4. Applies the full Terraform stack.

## 4. Restore Cloud SQL into RDS

Take a backup from GCP through the Cloud SQL Auth Proxy:

```bash
cloud-sql-proxy jemaw-498106:europe-west1:jemaw-pg --port 5433
set -a; . ./.gcp-secrets.env; set +a
PGPASSWORD="$JEMAW_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/pg_dump \
  -h 127.0.0.1 -p 5433 -U "$JEMAW_DB_USER" -d "$JEMAW_DB_NAME" \
  -Fc --no-owner --no-acl \
  -f "work/aws-migration/backups/jemaw-cloudsql-$(date +%Y%m%d-%H%M%S).dump"
```

Restore the newest dump:

```bash
./scripts/aws-restore-db.sh work/aws-migration/backups/<dump-file>.dump
```

## 5. Deploy the Mini App

```bash
./scripts/aws-deploy-app.sh
```

Use the `mini_app_url` Terraform output in BotFather as the Telegram Mini App URL.

## 6. Cut over Telegram webhook

```bash
./scripts/aws-set-telegram-webhook.sh
curl "$(cd infra/aws && tofu output -raw bot_service_url)/health"
```

Telegram should report the AWS CloudFront bot API webhook URL.

## 7. Redeploys

Bot:

```bash
./scripts/aws-deploy-bot.sh
```

Mini App:

```bash
./scripts/aws-deploy-app.sh
```

## Notes

- RDS deletion protection is enabled.
- RDS is publicly reachable only from `allowed_admin_cidr` and the ECS service security group.
- After migration, consider removing the direct admin CIDR from the DB security group or replacing it with a short-lived VPN/bastion workflow.
