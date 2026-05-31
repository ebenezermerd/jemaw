# syntax=docker/dockerfile:1
# Jemaw bot — container image for Cloud Run. Runs the bot in webhook mode.
# Build context is the REPO ROOT so the pnpm workspace resolves.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# ─── Build stage: full install (incl. tsx) over the real source ───────
FROM base AS build
# devDependencies (tsx) must be present, so NODE_ENV is not "production" here.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
RUN pnpm install --filter "@jemaw/bot..."

# ─── Runtime ──────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV BOT_MODE=webhook
ENV PORT=8080

# Copy the fully-installed app (source + root and per-package node_modules,
# with pnpm's symlinks intact) in one shot.
COPY --from=build /app /app

EXPOSE 8080
# Run the TS entrypoint via tsx, resolved from the installed bin.
CMD ["pnpm", "--filter", "@jemaw/bot", "exec", "tsx", "src/index.ts"]
