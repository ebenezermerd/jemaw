#!/usr/bin/env bash
set -euo pipefail

# Create the Jemaw bot on Render's free web service plan (Node runtime, built
# from the GitHub repo). Re-running after the service exists is not needed:
# Render redeploys on every push to main.
#
# Prerequisites (one-time):
#   brew install render && render login && render workspace set
#
# Reads TELEGRAM_BOT_TOKEN, GROQ_API_KEY and GEMINI_API_KEY from the repo .env
# unless already exported.
# DATABASE_URL defaults to the Neon project's pooled connection string via neonctl.
# Optional:
#   MINI_APP_URL (default: the Cloudflare Workers URL of the mini app)
#   SERVICE_NAME (default: jemaw-bot), REGION (default: virginia, next to Neon us-east-1)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

from_dotenv() {
  [[ -f "$ROOT_DIR/.env" ]] && grep "^$1=" "$ROOT_DIR/.env" | cut -d= -f2- || true
}
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(from_dotenv TELEGRAM_BOT_TOKEN)}"
GROQ_API_KEY="${GROQ_API_KEY:-$(from_dotenv GROQ_API_KEY)}"
GEMINI_API_KEY="${GEMINI_API_KEY:-$(from_dotenv GEMINI_API_KEY)}"
: "${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN}"
if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(neonctl connection-string --project-id "${NEON_PROJECT_ID:-frosty-moon-46010184}" --pooled)"
fi
: "${DATABASE_URL:?Set DATABASE_URL (Neon pooled connection string)}"

SERVICE_NAME="${SERVICE_NAME:-jemaw-bot}"
REGION="${REGION:-virginia}"
PUBLIC_URL="https://${SERVICE_NAME}.onrender.com"

env_flags=(
  --env-var "NODE_VERSION=22"
  --env-var "NODE_ENV=production"
  --env-var "BOT_MODE=webhook"
  --env-var "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}"
  --env-var "DATABASE_URL=${DATABASE_URL}"
  --env-var "WEBHOOK_URL=${PUBLIC_URL}"
  --env-var "REGISTER_TELEGRAM_WEBHOOK=true"
  --env-var "BOT_USERNAME=${BOT_USERNAME:-jemawsbot}"
  --env-var "MINI_APP_SHORT_NAME=${MINI_APP_SHORT_NAME:-app}"
  --env-var "GROQ_MODEL=${GROQ_MODEL:-openai/gpt-oss-120b}"
  --env-var "MINI_APP_URL=${MINI_APP_URL:-https://jemaw-app.ebenezermerd.workers.dev}"
)
[[ -n "${GROQ_API_KEY:-}" ]]   && env_flags+=(--env-var "GROQ_API_KEY=${GROQ_API_KEY}")
[[ -n "${GEMINI_API_KEY:-}" ]] && env_flags+=(--env-var "GEMINI_API_KEY=${GEMINI_API_KEY}")

# devDependencies (tsx) are needed at runtime, hence --prod=false.
render services create --confirm --output json \
  --name "$SERVICE_NAME" --type web_service --plan free --region "$REGION" \
  --repo https://github.com/ebenezermerd/jemaw --branch main --runtime node \
  --build-command 'npx -y pnpm@10 install --frozen-lockfile --prod=false --filter "@jemaw/bot..."' \
  --start-command 'cd packages/bot && ./node_modules/.bin/tsx src/index.ts' \
  --health-check-path /health \
  --build-filter-path 'packages/bot/**' \
  --build-filter-path 'packages/shared/**' \
  --build-filter-path 'pnpm-lock.yaml' \
  "${env_flags[@]}" | grep -E '"(id|url|dashboardUrl)"' || true

echo "Created ${SERVICE_NAME}. First build takes a few minutes; it registers the Telegram webhook at ${PUBLIC_URL} on boot."
