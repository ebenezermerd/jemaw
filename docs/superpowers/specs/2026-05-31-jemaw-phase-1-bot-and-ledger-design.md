# Jemaw — Phase 1: Bot + Manual Ledger (Design Spec)

**Date:** 2026-05-31
**Builds on:** Phase 0 foundations (monorepo, schema, /health, /start, /help).
**Source of truth:** `JEMAW_PLAN.md` Phases 1, plus §5, §7, §10, §11, §13, §15.

---

## 1. Goal & Done-Criteria

Phase 1 delivers a working manual expense ledger inside Telegram — **no AI yet**.

Done when, locally (and deploy-ready):

1. Adding the bot to a group + `/start` creates a `groups` row, registers the
   installer + fetchable admins as `members`, and posts the pinned Jemaw button.
2. The bot captures the **group chat ID automatically** (no manual entry).
3. Group members are registered see-as-they-speak; installer/admins at `/start`;
   manual add/rename in Settings.
4. Incoming group text messages are persisted to `messages` (privacy-mode aware).
5. The Mini App authenticates every API call via **real initData HMAC-SHA256**
   (+ 24h freshness) and resolves the caller to a member of the calling group.
6. Manual expense entry works end-to-end for **all three split types**
   (equal, shares, exact) with correct `expense_shares` rows.
7. Balances tab shows correct per-member net positions.
8. History tab lists expenses reverse-chronologically, filterable by member.
9. Pinned-message manager keeps one pinned button current per group.
10. `pnpm typecheck` + `pnpm test` green; balance + split math unit-tested.

**Not in Phase 1:** settle-up algorithm/screen, mark-as-paid, edit/void of
existing expenses (view only), Gemini, suggestions, DMs, Framer Motion.

---

## 2. Architecture additions

Phase 1 introduces the **API layer** (bot service) and the **app feature layer**.

### Bot service (`packages/bot`)

```
src/
  env.ts                  (P0, +HMAC secret derivation from bot token)
  db.ts                   (P0)
  server.ts               (P0, + register API routes + auth hook)
  bot.ts                  (P0 cmds + group lifecycle handlers)
  index.ts                (P0)
  auth/
    initData.ts           # parse + HMAC-verify Telegram initData, 24h check
    authHook.ts           # Fastify preHandler: verify, resolve member, attach to req
  telegram/
    pinnedMessage.ts      # ensure/update the single pinned button per group
    memberSync.ts         # register members (speaker, installer, admins, manual)
    messageCapture.ts     # persist group messages -> messages table
  domain/
    balances.ts           # pure: expenses+shares -> net position per member
    splits.ts             # pure: equal/shares/exact -> expense_shares (cents-safe)
  api/
    groups.ts             # GET /api/groups/:id  (group + members + currency)
    expenses.ts           # POST /api/groups/:id/expenses, GET list
    balances.ts           # GET /api/groups/:id/balances
    history.ts            # GET /api/groups/:id/history
    members.ts            # POST add, PATCH rename (Settings)
```

### Mini App (`packages/app`)

```
src/
  main.tsx, App.tsx       (P0 -> replaced with router shell)
  telegram.ts             (P0)
  lib/
    api.ts                # fetch wrapper, attaches initData header
    query.ts              # TanStack Query client
  ui/                     # design-system primitives (subset of plan §12.10)
    Button.tsx, Card.tsx, Avatar.tsx, Pill.tsx, Sheet.tsx, Toast.tsx,
    AmountInput.tsx, MemberSelector.tsx, TabBar.tsx
  routes/
    Home.tsx              # conditional: balances summary (no suggestions yet)
    Add.tsx               # manual expense entry (3 split types)
    Balances.tsx
    History.tsx
    ExpenseDetail.tsx     # view existing expense (read-only in P1)
    Settings.tsx          # members add/rename, currency (locked once expenses)
  styles/
    tokens.css            # plan §12.2/§12.4/§12.5 tokens (dark default + light)
```

State: **TanStack Query** for server state, **Zustand** for cross-route UI state
(active history filter). No SSE yet (Phase 3). No Framer Motion (Phase 4) —
CSS transitions only, per plan's Phase 2/4 split.

---

## 3. Auth — initData HMAC (plan §15)

Telegram signs `initData` (a URL-encoded query string) with a key derived from
the bot token: `secret = HMAC_SHA256("WebAppData", bot_token)`, then
`hash = HMAC_SHA256(secret, data_check_string)`. We:

1. Parse `initData`, extract `hash` and the sorted `data_check_string`.
2. Recompute and constant-time compare. Reject on mismatch (401).
3. Reject if `auth_date` older than 24h (replay guard).
4. Parse `user.id` (Telegram user id), resolve to a `members` row in the
   group identified by the route's `:id`. Reject if not an active member (403).
5. Attach `{ member, group }` to the Fastify request for handlers.

Membership re-confirmation against the live Telegram chat (plan's "cached 5 min")
is **deferred** — Phase 1 trusts the `members` table. Noted as a Phase 2/3
hardening item.

`HMAC` uses Node `crypto`; no new dependency.

---

## 4. Group lifecycle & member sync

- **`my_chat_member` / added to group** → upsert `groups` (by `telegram_chat_id`),
  capture chat id + title. Attempt `getChatAdministrators` to seed members.
- **`/start` in group** → ensure group row, register the sender, post/refresh
  pinned button, reply with onboarding text (plan §13.1).
- **Any group text message** → (a) `messageCapture` persists it; (b) `memberSync`
  registers the sender if unknown (see-as-they-speak).
- **Manual add/rename** (Settings) → `POST /members`, `PATCH /members/:id`.
- **Privacy mode**: if the bot can't read messages, capture silently yields
  nothing; onboarding surfaces a warning (full hard-gate is Phase 3's concern,
  but we detect + warn now).

Member uniqueness enforced by the existing `unique(group_id, telegram_user_id)`.

---

## 5. Domain logic (pure, unit-tested)

### splits.ts
Input: total amount, split_type, members (+ shares/exact maps).
Output: `expense_shares` amounts that **sum exactly to the total**.

- Work in **integer cents** internally (avoids float drift, plan §14).
- **Equal**: floor-divide; distribute remainder cents one-per-member,
  remainder-bearer chosen by a deterministic hash of expense id (plan §14) so
  it's fair over time.
- **Shares**: weighted by integer share counts; same remainder distribution.
- **Exact**: validate the per-member amounts sum to the total; reject otherwise.

### balances.ts
Net position per member = (sum paid as payer) − (sum of their shares),
over non-voided expenses. Phase 1 has no settlements yet, so they don't enter
the calculation until Phase 2. Returns signed cents per member.

Both are pure functions over plain data — no DB, fully testable.

---

## 6. API surface (Phase 1)

All under `/api/groups/:groupId`, all behind the auth hook.

| Method | Path | Body / returns |
|---|---|---|
| GET | `/api/groups/:id` | group meta + members + currency |
| GET | `/api/groups/:id/balances` | `[{ memberId, displayName, netCents }]` |
| GET | `/api/groups/:id/expenses` | list (paginated, newest first) |
| POST | `/api/groups/:id/expenses` | create expense + shares; returns it |
| GET | `/api/groups/:id/history` | expenses (+ settlements later), grouped by day, member filter |
| GET | `/api/groups/:id/expenses/:expenseId` | one expense + shares |
| POST | `/api/groups/:id/members` | add member (manual) |
| PATCH | `/api/groups/:id/members/:memberId` | rename |

Wire format: ids as strings; money as decimal strings (`numeric(12,2)`);
Telegram ids stringified (Phase 0 convention). Request/response shapes typed in
`@jemaw/shared/types` so the app imports them directly.

Validation: **zod** schemas per route (Fastify schema validation).

---

## 7. Mini App screens (Phase 1 subset of plan §13)

- **Home** (§13.2): header (group name + member count), bottom tab bar
  (Balances, History, Add — Suggestions tab hidden until Phase 3). Home body =
  Balances summary (no suggestions yet).
- **Add** (§13.4): description, amount (custom keypad sheet, tabular nums),
  payer selector, split-type segmented control, member chip selector, and the
  per-type controls (shares steppers / exact inputs with running total +
  remainder indicator). Validates before enabling Save.
- **Balances** (§13.5): one row per member, sorted desc; positive in `--accent`,
  negative in `--warn`; tap row → History filtered to that member.
- **History** (§13.7): reverse-chron, grouped by day; expense rows (payer
  avatar + amount); member filter chips. Settlement rows arrive Phase 2.
- **ExpenseDetail** (§13.4 read mode): view an expense + its shares. Edit/void
  deferred to Phase 2.
- **Settings** (§13.8 subset): members list (add/rename), currency (shown,
  locked once any expense exists, with the reason).

Design tokens from plan §12 are implemented as CSS variables now; full motion
system (Framer Motion, layoutId, number animations) stays in Phase 4. Phase 1
uses plain CSS transitions and respects `prefers-reduced-motion`.

---

## 8. Testing

- **splits.ts**: equal/shares/exact all sum to total; remainder distribution;
  remainder-bearer determinism; exact-mismatch rejection.
- **balances.ts**: multi-expense net positions; voided expenses excluded;
  zero-sum invariant (all balances sum to 0).
- **initData.ts**: valid signature accepts; tampered rejects; >24h rejects.
  (Uses a fixed bot token + a hand-constructed signed initData fixture.)
- **API**: POST expense then GET balances reflects it (Fastify `inject`,
  against a test DB or a transactional rollback per test).
- **App**: Add form renders all three split modes; Balances renders rows.

Test DB: reuse the local Postgres; API tests wrap each case in a transaction
that rolls back, or use a dedicated `jemaw_test` database. (Decide at build:
default to a separate `jemaw_test` DB created in a test setup file.)

---

## 9. Risks specific to Phase 1

| Risk | Mitigation |
|---|---|
| Bot can't enumerate members (TG API limit) | See-as-they-speak + admins + manual top-up (accepted design). |
| Float drift in splits | Integer-cents math throughout; invariant test that shares sum to total. |
| initData verification subtly wrong | Constant-time compare; dedicated fixture-based tests; reference the documented algorithm exactly. |
| Privacy mode hides messages | Detect + warn in onboarding; capture degrades gracefully to empty. |
| Currency change after expenses | Lock currency once any expense exists (Settings shows why). |

---

## 10. Out of scope (later)

- Phase 2: settle-up algorithm + screen, mark-as-paid, settlements in balances,
  edit/void expenses, 5-min membership re-confirmation.
- Phase 3: Gemini scan, suggestions tab, DM dispatcher, rate limiting, SSE.
- Phase 4: Framer Motion, shared layoutId, number animations, skeletons.
