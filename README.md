# Jemaw

A Telegram native expense companion for friend groups. Drop "jemaw" in your
group chat, confirm AI suggested expenses in a Mini App, and settle off platform.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (pnpm workspace) |
| Bot / API | grammY + Fastify |
| Mini App | Vite + React + TanStack Query |
| Database | Postgres + Drizzle ORM |
| AI | Google Gemini (`gemini-2.5-flash`) |
| Hosting | Cloud Run (bot) + Firebase Hosting (app) |

## Packages

- `packages/shared` — Drizzle schema and shared API types.
- `packages/bot` — Fastify server, grammY bot, REST API, domain logic.
- `packages/app` — the Telegram Mini App SPA.

## Local development

```bash
docker compose up -d   # local Postgres
cp .env.example .env    # set TELEGRAM_BOT_TOKEN
pnpm install
pnpm db:migrate         # create tables
pnpm dev:bot            # bot + API on :8080
pnpm dev:app            # Mini App on :5173
```

See `docs/DEPLOY_GCP.md` for deployment and `docs/HANDLER.md` for Cloud SQL
operations.
