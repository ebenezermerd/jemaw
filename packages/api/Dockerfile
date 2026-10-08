# syntax=docker/dockerfile:1
# Jemaw admin API — container image for Cloud Run.
# Build context is the REPO ROOT so the pnpm workspace resolves.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# ─── Build stage: full install (incl. tsx) over the real source ───────
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm install --filter "@jemaw/api..."

# ─── Runtime ──────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app

EXPOSE 8080
CMD ["pnpm", "--filter", "@jemaw/api", "exec", "tsx", "src/index.ts"]
