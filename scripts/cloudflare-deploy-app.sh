#!/usr/bin/env bash
set -euo pipefail

# Build the Jemaw mini app and deploy it to Cloudflare Workers static assets (free).
# The API URL comes from packages/app/.env.production unless VITE_API_BASE_URL is set.
#
# Prerequisites (one-time):
#   npm i -g wrangler && wrangler login

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
pnpm --filter @jemaw/app build

# Run from the package so wrangler picks up packages/app/wrangler.jsonc.
cd "$ROOT_DIR/packages/app"
wrangler deploy
