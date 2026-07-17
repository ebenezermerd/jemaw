#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/infra/aws"

cd "$AWS_DIR"
TF_BIN="${TF_BIN:-$(command -v terraform || command -v tofu || true)}"
if [[ -z "$TF_BIN" ]]; then
  echo "terraform or tofu is required." >&2
  exit 1
fi

BOT_URL="$("$TF_BIN" output -raw bot_service_url)"
TOKEN_SECRET_ARN="$("$TF_BIN" output -raw telegram_bot_token_secret_arn)"
TOKEN="$(aws secretsmanager get-secret-value --secret-id "$TOKEN_SECRET_ARN" --query SecretString --output text)"

curl -fsS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  --json "{\"url\":\"$BOT_URL/telegram/webhook\"}"

echo
curl -fsS "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
echo
