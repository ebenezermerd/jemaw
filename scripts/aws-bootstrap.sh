#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/infra/aws"
TFVARS="$AWS_DIR/terraform.tfvars"

TF_BIN="${TF_BIN:-$(command -v terraform || command -v tofu || true)}"

if [[ -z "$TF_BIN" ]]; then
  echo "terraform or tofu is required. Install one, then rerun this script." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required. Install and authenticate it first, then rerun this script." >&2
  exit 1
fi

if [[ ! -f "$TFVARS" ]]; then
  cp "$AWS_DIR/terraform.tfvars.example" "$TFVARS"
  chmod 600 "$TFVARS"
  echo "Created $TFVARS. Fill in the real values, then rerun this script." >&2
  exit 1
fi

cd "$AWS_DIR"
"$TF_BIN" init

# First pass creates ECR so the Docker image can be pushed before ECS starts.
"$TF_BIN" apply -target=aws_ecr_repository.bot -target=aws_ecr_lifecycle_policy.bot

ECR_URL="$("$TF_BIN" output -raw ecr_repository_url)"
REGION="$("$TF_BIN" output -raw aws_region 2>/dev/null || awk -F= '/aws_region/ { gsub(/[ "]/, "", $2); print $2 }' "$TFVARS")"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker build -f "$ROOT_DIR/packages/bot/Dockerfile" -t "$ECR_URL:latest" "$ROOT_DIR"
docker push "$ECR_URL:latest"

"$TF_BIN" apply

echo
echo "AWS infrastructure is ready."
"$TF_BIN" output
