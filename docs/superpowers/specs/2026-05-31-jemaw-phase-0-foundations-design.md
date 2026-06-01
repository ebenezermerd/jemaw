# Jemaw — Phase 0: Foundations (Design Spec)

**Date:** 2026-05-31
**Scope:** A local-runnable, deploy-ready walking skeleton. No features yet.
**Source of truth for the product:** `JEMAW_PLAN.md` (this spec implements its Phase 0).

---

## 1. Goal & Done-Criteria

Phase 0 is "done" when, **on the developer's machine**:

1. `pnpm install` at the root installs all three packages.
2. `docker compose up -d` starts a local Postgres.
3. `pnpm db:push` (or `db:migrate`) creates all 8 tables from `JEMAW_PLAN.md` §7.
4. `pnpm --filter @jemaw/bot dev` boots the Fastify server; `/health` returns `{ ok: true }`.
5. With a real bot token in `.env`, the bot responds to `/start` and `/help` in Telegram (via long-polling locally; webhook config written for prod).
6. `pnpm --filter @jemaw/app dev` serves the Mini App SPA showing a placeholder "Jemaw" screen that reads (or stubs) Telegram `initData`.
7. Deploy configs (`fly.toml`, `vercel.json`) exist and are correct, but **are not deployed** — the developer runs deploys when ready.
8. `pnpm typecheck` and `pnpm test` pass across the workspace.

**Explicitly NOT in Phase 0:** any expense logic, balances, suggestions, AI, settle-up, pinned-message management, member sync, real auth enforcement. Those are Phases 1–4.

---

## 2. Architecture

Monorepo via **pnpm workspaces**. Three packages, one-way dependency graph:

```
packages/shared  ◀── packages/bot
       ▲
       └────────── packages/app
```

- `@jemaw/shared` — Drizzle schema (all 8 tables) + shared API/contract types. Single source of truth for the data model. No runtime server code.
- `@jemaw/bot` — Fastify HTTP server + grammY bot. Imports schema from shared.
- `@jemaw/app` — Vite + React SPA. Imports contract types from shared. Never imports bot.

`bot` and `app` never import each other.

### Directory layout

```
jemaw/
├── package.json                 # workspace root + scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml           # local Postgres 16
├── .env.example                 # documented, no secrets
├── .gitignore
├── docs/superpowers/specs/...
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── schema.ts        # all 8 tables
│   │       ├── types.ts         # API contract types
│   │       └── index.ts         # re-exports
│   ├── bot/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── fly.toml             # NOT deployed
│   │   ├── Dockerfile           # for Fly
│   │   └── src/
│   │       ├── env.ts           # zod-validated env
│   │       ├── db.ts            # Drizzle client
│   │       ├── bot.ts           # grammY instance, /start + /help
│   │       ├── webhook.ts       # webhook route (prod) + polling (local)
│   │       ├── server.ts        # Fastify app, /health
│   │       └── index.ts         # entrypoint
│   └── app/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vercel.json          # NOT deployed
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx          # placeholder screen
│           └── telegram.ts      # initData reader (stub-safe)
```

---

## 3. Data Model — Full Drizzle Schema

All 8 tables from `JEMAW_PLAN.md` §7, created in Phase 0 (stable model; avoid migration churn). Tables sit unused until their phase. Postgres-specific types via `drizzle-orm/pg-core`.

Key decisions:
- **UUID primary keys** via `gen_random_uuid()` default (`uuid().defaultRandom()`).
- **Money as `numeric(12,2)`** per the plan's schema text. (Note: the plan's §14 mentions integer-cents for the settle-up algorithm; that is a *computation* detail handled in Phase 2, not storage. Storage stays `numeric(12,2)` as §7 specifies.)
- **Telegram IDs as `bigint`** (mode `number` is unsafe for IDs > 2^53; use `bigint({ mode: 'bigint' })` and serialize as string at the API boundary).
- **`timestamptz`** for all timestamps (`timestamp({ withTimezone: true })`).
- **`jsonb`** for `settings`, `split_with`, `shares`, `evidence_message_ids`, `raw_response`.
- Enums via Postgres enum types: `expense_source`, `split_type`, `suggestion_status`, `ai_trigger_type`, `ai_run_status`.
- Foreign keys with explicit `references()`; composite uniques per the plan (`unique(group_id, telegram_user_id)`, `unique(group_id, telegram_message_id)`).

Tables: `groups`, `members`, `expenses`, `expense_shares`, `settlements`, `suggestions`, `ai_runs`, `messages` — columns exactly as `JEMAW_PLAN.md` §7. A 30-day retention sweep on `messages` is noted but **not implemented** in Phase 0 (it's an operational job for later).

---

## 4. Environment & Config Contract

Single root `.env` (gitignored) + `.env.example` (committed, documented). Validated at bot startup with **zod**; the process refuses to boot on missing/invalid vars.

| Var | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | bot, shared (drizzle) | Local: `postgres://jemaw:jemaw@localhost:5432/jemaw` |
| `TELEGRAM_BOT_TOKEN` | yes (for bot to talk to TG) | bot | From @BotFather |
| `BOT_MODE` | yes | bot | `polling` (local) or `webhook` (prod) |
| `WEBHOOK_URL` | only if `BOT_MODE=webhook` | bot | Public HTTPS base URL |
| `PORT` | no (default 8080) | bot | Fastify listen port |
| `MINI_APP_URL` | no in P0 | bot | Mini App base URL for buttons (placeholder in P0) |
| `NODE_ENV` | no (default development) | bot | |
| `VITE_API_BASE_URL` | no in P0 | app | Where the SPA calls the bot API |

`GEMINI_API_KEY`, `REDIS_URL`, `SENTRY_DSN` are listed in `.env.example` as **future (Phase 3+)** and not validated/required in Phase 0.

---

## 5. How It Runs Locally (Data Flow in P0)

1. **DB:** `docker compose up -d` → Postgres 16 on `:5432`. `pnpm db:push` applies the Drizzle schema.
2. **Bot:** `pnpm --filter @jemaw/bot dev` → zod validates env → Drizzle connects → Fastify listens on `:8080` with `/health` → grammY starts in **polling** mode (no public URL needed locally). `/start` and `/help` reply with placeholder copy from the plan (§13.1 onboarding text for `/start`, command list for `/help`).
3. **App:** `pnpm --filter @jemaw/app dev` → Vite dev server. `telegram.ts` reads `window.Telegram.WebApp.initData` if present, else a dev stub, and renders the placeholder `App.tsx`.

**Webhook vs polling:** `webhook.ts` exposes the route + `setWebhook` call used when `BOT_MODE=webhook` (prod/Fly). Locally we use polling so no tunnel/ngrok is needed. This is the one place the plan is silent on; polling-for-local is the standard grammY pattern.

---

## 6. Deploy Configs (written, not run)

- `packages/bot/fly.toml` + `Dockerfile`: `shared-cpu-1x`, internal port 8080, health check on `/health`, `BOT_MODE=webhook`. Secrets set via `fly secrets` (documented in spec, not executed).
- `packages/app/vercel.json`: static build of the Vite SPA, SPA rewrite to `index.html`.

A short `docs/DEPLOY.md` lists the exact commands the developer runs to go live (BotFather token, `neon` URL, `fly deploy`, `vercel deploy`, `setWebhook`).

---

## 7. Testing Approach

Phase 0 is mostly scaffolding, but we verify the parts that can break silently:

- **Schema test:** spin up the schema against the local DB (or pg-mem if feasible) and assert all 8 tables + key constraints exist. Confirms migrations actually apply.
- **Env validation test:** zod env parser rejects missing `DATABASE_URL` / `TELEGRAM_BOT_TOKEN`, accepts a valid set.
- **Server test:** Fastify `/health` returns `{ ok: true }` (inject, no real listen).
- **Bot handler test:** `/start` and `/help` handlers produce the expected reply text (grammY test/transformer or a thin unit around the handler functions).
- **App:** a single render smoke test (Vitest + Testing Library) that `App.tsx` mounts with a stubbed `initData`.

Test runner: **Vitest** across the workspace. `pnpm test` runs all; `pnpm typecheck` runs `tsc --noEmit` per package.

---

## 8. Risks specific to Phase 0

| Risk | Mitigation |
|---|---|
| `bigint` Telegram IDs lose precision as JS numbers | Drizzle `bigint({ mode: 'bigint' })`; serialize to string at API edges (documented convention in `shared/types.ts`). |
| React (app) and Fastify (bot) deps collide | pnpm workspaces isolate per-package `node_modules`; no shared flat tree. |
| Drizzle config path / multi-package confusion | `drizzle.config.ts` lives in `shared`, points at `src/schema.ts`; bot imports the compiled/TS schema via `@jemaw/shared`. |
| "Done" depends on external token | Long-polling makes `/start`+`/help` testable with only a token, no deploy; everything else verifiable with zero external accounts. |

---

## 9. Out of scope (later phases, for reference)

- Phase 1: onboarding, member sync, pinned-message manager, initData HMAC auth enforcement, manual expense entry, balances, history.
- Phase 2: settle-up algorithm + screen, mark-as-paid, edit/void.
- Phase 3: Gemini scan loop, suggestions, DM dispatcher, rate limiting.
- Phase 4: Framer Motion, shared layoutId, number animations, reduced-motion.
