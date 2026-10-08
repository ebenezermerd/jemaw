#!/usr/bin/env bash
set -euo pipefail

# Create the admin API on Render's free web service plan (Node runtime, built
# from the GitHub repo). Render redeploys on every push to BRANCH afterwards.
# It sleeps when idle, which is fine for an admin console used now and then.
#
# Prerequisites (one-time):
#   brew install render && render login && render workspace set
#
# DATABASE_URL defaults to the Neon project's pooled connection string via neonctl.
# Optional:
#   FIREBASE_PROJECT_ID (default: jemaw-admin-1008)
#   ADMIN_EMAILS (comma-separated admins seeded on first boot)
#   ADMIN_ORIGIN (default: the Cloudflare Workers URL of the admin console)
#   SERVICE_NAME (default: jemaw-api), REGION (default: virginia), BRANCH (default: main)

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(neonctl connection-string --project-id "${NEON_PROJECT_ID:-frosty-moon-46010184}" --pooled)"
fi
: "${DATABASE_URL:?Set DATABASE_URL (Neon pooled connection string)}"
: "${ADMIN_EMAILS:?Set ADMIN_EMAILS}"

SERVICE_NAME="${SERVICE_NAME:-jemaw-api}"
REGION="${REGION:-virginia}"

# devDependencies (tsx) are needed at runtime, hence --prod=false.
render services create --confirm --output json \
  --name "$SERVICE_NAME" --type web_service --plan free --region "$REGION" \
  --repo https://github.com/ebenezermerd/jemaw --branch "${BRANCH:-main}" --runtime node \
  --build-command 'npx -y pnpm@10 install --frozen-lockfile --prod=false --filter "@jemaw/api..."' \
  --start-command 'cd packages/api && ./node_modules/.bin/tsx src/index.ts' \
  --health-check-path /health \
  --build-filter-path 'packages/api/**' \
  --build-filter-path 'packages/shared/**' \
  --build-filter-path 'pnpm-lock.yaml' \
  --env-var "NODE_VERSION=22" \
  --env-var "NODE_ENV=production" \
  --env-var "DATABASE_URL=${DATABASE_URL}" \
  --env-var "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-jemaw-admin-1008}" \
  --env-var "ADMIN_EMAILS=${ADMIN_EMAILS}" \
  --env-var "ADMIN_ORIGIN=${ADMIN_ORIGIN:-https://jemaw-admin.ebenezermerd.workers.dev}" \
  | grep -E '"(id|url|dashboardUrl)"' || true

echo "Created ${SERVICE_NAME}. First build takes a few minutes."
