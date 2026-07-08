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

API_URL="$("$TF_BIN" output -raw bot_service_url)"
BUCKET="$("$TF_BIN" output -raw app_bucket)"
DISTRIBUTION_ID="$("$TF_BIN" output -raw cloudfront_distribution_id)"

cd "$ROOT_DIR"
VITE_API_BASE_URL="$API_URL" pnpm --filter @jemaw/app build

aws s3 sync "$ROOT_DIR/packages/app/dist/" "s3://$BUCKET/" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

aws s3 cp "$ROOT_DIR/packages/app/dist/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null

echo "Mini App deployed to $(cd "$AWS_DIR" && "$TF_BIN" output -raw mini_app_url)"
