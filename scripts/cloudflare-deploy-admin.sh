#!/usr/bin/env bash
set -euo pipefail

# Build the admin console and deploy it to Cloudflare Workers static assets (free).
# Config comes from packages/admin/.env.production. The API URL is exported
# explicitly because a local packages/admin/.env.local would otherwise win.
#
# Prerequisites (one-time):
#   npm i -g wrangler && wrangler login

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export VITE_API_BASE_URL="${VITE_API_BASE_URL:-$(grep '^VITE_API_BASE_URL=' "$ROOT_DIR/packages/admin/.env.production" | cut -d= -f2-)}"

cd "$ROOT_DIR"
pnpm --filter @jemaw/admin build

# Run from the package so wrangler picks up packages/admin/wrangler.jsonc.
cd "$ROOT_DIR/packages/admin"
wrangler deploy
