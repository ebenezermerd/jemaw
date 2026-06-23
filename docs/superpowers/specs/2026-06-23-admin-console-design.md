# Jemaw Admin Console — Design

Date: 2026-06-23
Branch: `feat/admin-console`
Design source: claude.ai design project `fbe31593-6d54-4c65-9d4b-027b19ade094`, file `Jemaw Admin.dc.html`.

## Goal

Add a web admin console to the existing Jemaw pnpm monorepo to manage users, groups,
expenses/settlements, activity logs, announcements, and bot configuration — without
changing how the bot (Cloud Run) or mini-app (Firebase Hosting) build or deploy.

## Architecture

Two new packages added to the existing workspace (`packages/*`):

- `packages/admin` (`@jemaw/admin`) — Vite + React 18 SPA (mirrors `@jemaw/app`),
  served on a **second Firebase Hosting target** (`admin`).
- `packages/api` (`@jemaw/api`) — Fastify + zod service on its **own Cloud Run
  service**, reusing `@jemaw/shared` (Drizzle + postgres-js) for DB access.

Communication: admin SPA → api over HTTPS/JSON. Both `api` and `bot` read/write the
**same Postgres** via Drizzle. No service-to-service calls. The bot's Cloud Run
deploy (`cloudbuild.yaml`, `packages/bot/Dockerfile`) is unchanged; the app's Firebase
hosting `public` dir is unchanged.

```
packages/
├── shared/  @jemaw/shared    (+3 tables, reused by all)
├── bot/     @jemaw/bot       (reads new tables additively; deploy UNCHANGED)
├── app/     @jemaw/app       (UNCHANGED)
├── admin/   @jemaw/admin     (NEW Vite SPA → 2nd Firebase target)
└── api/     @jemaw/api       (NEW Fastify service → Cloud Run)
```

## Auth

Firebase Auth (email/password). The admin SPA signs in with the Firebase Web SDK and
sends the ID token as `Authorization: Bearer <token>`. The api verifies the token with
firebase-admin and checks the caller is an allowed admin (UID/email present in the
`app_config` admin allowlist, seeded from `ADMIN_EMAILS` env on first boot). A Fastify
auth hook (mirrors the bot's `authHook.ts`) gates every `/api/admin/*` route and
attaches `req.admin = { uid, email, role }`.

## Data model changes (`@jemaw/shared`)

No global users table. "Users" in the UI = `members` aggregated by `telegramUserId`.
"Suspend" = set `isActive=false` on that telegram id's member rows.

One Drizzle migration adds three tables (additive; bot reads them but existing bot
writes are untouched):

- `admin_audit_log` — `id, actor_uid, actor_email, action, target_type, target_id,
  detail jsonb, created_at`. Every admin write inserts one row.
- `announcements` — `id, title, body, audience (enum: all_groups | group | user),
  target_id (nullable), status (enum: draft | queued | sending | sent | failed),
  created_by_uid, created_at, sent_at, stats jsonb`. The api queues rows; the bot has
  a sender (polls `queued`, sends via Telegram, marks `sent`). Sender is a small
  additive bot module; if Telegram send is deferred, rows simply stay `queued`.
- `app_config` — `key (pk text), value jsonb, updated_at, updated_by_uid`. Holds the
  admin allowlist (`admins`), feature flags, and bot settings as key/value rows.

## API surface (all under `/api/admin/`, behind Firebase auth hook)

- `GET /me` — current admin identity/role (for the SPA after login).
- `GET /overview` — KPIs (total users, active groups, expenses tracked sum, settlements
  /week), 14-day activity series, user-status donut, recent activity, top groups by
  volume. Reuses `domain/balances` math where needed.
- `GET /users`, `GET /users/:telegramId`, `POST /users/:telegramId/suspend`,
  `POST /users/:telegramId/activate` — aggregated by telegram id.
- `GET /groups`, `GET /groups/:id`.
- `GET /expenses` (cross-group, paginated, filters), `GET /settlements`,
  `POST /expenses/:groupId/:expenseId/void` (reuses `voidExpense`),
  `DELETE /settlements/:groupId/:settlementId` (reuses `deleteSettlement`).
- `GET /logs` — audit feed (paginated).
- `GET /announcements`, `POST /announcements` (create/queue).
- `GET /config`, `PATCH /config` — settings + feature flags.

Wire conventions match the bot: bigint→string, money→decimal string. New DTOs live in
`@jemaw/shared/types`. Every write goes through one `audit()` helper.

## Admin SPA screens (to the design)

Design system tokens (from the mockup): bg `#07070b`/`#0B0A11`, surface `#16151F`,
sidebar `#0D0C14`, accent `#6E59C7`, accent-soft `#A99CE3`, success `#2DD4A7`, warn
`#E0B23C`, danger `#F2685F`, info `#5BA8E0`; fonts Bricolage Grotesque (display),
Hanken Grotesk (body), Space Mono (labels). Captured in `src/styles/tokens.css`.

Routes (react-router): `/login`, `/` (Overview), `/users`, `/groups`, `/expenses`,
`/logs`, `/announcements`, `/settings`. Shared `AppShell` (sidebar + topbar) from the
design. Data via `@tanstack/react-query` + an `api` client that injects the Firebase
token. recharts for the activity chart/donut. Each route is its own file under
`src/routes/`; shared UI under `src/ui/`.

All 7 sections are functional in v1 (read live data; writes where the design implies
them — suspend, void, delete, queue announcement, edit config).

## Deploy wiring

- `firebase.json` → multi-target hosting: keep existing app target, add `admin` target
  serving `packages/admin/dist`. Add `.firebaserc` target mapping.
- New `packages/api/Dockerfile` (mirrors bot's, filtered to `@jemaw/api...`) + a
  `cloudbuild.api.yaml` (or substitution) building it. Bot's `cloudbuild.yaml` untouched.
- CI (`pnpm -r typecheck/test`) picks up both new packages with no edit.
- New env: `ADMIN_EMAILS`, `FIREBASE_PROJECT_ID` (api); `VITE_FIREBASE_*`,
  `VITE_API_BASE_URL` (admin). Added to `.env.example`.

## Testing

- `@jemaw/shared`: schema test covers the 3 new tables.
- `@jemaw/api`: unit tests for the auth hook (valid/invalid/forbidden) and the
  users-aggregation mapper; integration-style tests for overview + list endpoints with
  a seeded db (mirrors bot's integration test approach).
- `@jemaw/admin`: component tests for AppShell nav state and one data screen render.

## Out of scope (v1)

Real Telegram broadcast delivery may land as a follow-up if the bot sender is deferred;
the queue + UI are in v1. No SSR. No per-group admin delegation (single global admin role).
