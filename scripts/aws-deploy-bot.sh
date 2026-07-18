#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/infra/aws"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required." >&2
  exit 1
fi

cd "$AWS_DIR"
TF_BIN="${TF_BIN:-$(command -v terraform || command -v tofu || true)}"
if [[ -z "$TF_BIN" ]]; then
  echo "terraform or tofu is required." >&2
  exit 1
fi

ECR_URL="$("$TF_BIN" output -raw ecr_repository_url)"
REGION="$("$TF_BIN" output -raw aws_region)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Fargate tasks are linux/amd64; build for that even on Apple Silicon.
docker build --platform linux/amd64 \
  -f "$ROOT_DIR/packages/bot/Dockerfile" \
  -t "$ECR_URL:latest" \
  "$ROOT_DIR"
docker push "$ECR_URL:latest"

aws ecs update-service \
  --region "$REGION" \
  --cluster jemaw-prod-bot \
  --service jemaw-prod-bot \
  --force-new-deployment >/dev/null

echo "Pushed $ECR_URL:latest and requested a fresh ECS deployment."
