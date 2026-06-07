# Per-Group Roles + Admin Actions — Design

**Date:** 2026-06-07
**Status:** Approved, ready for implementation

## Goal

Introduce a per-group role (`admin` vs `member`) so destructive and
group-wide actions are restricted to admins, and add an in-app admin-only
**Reset group ledger** action. Roles are inherited from Telegram group
admins — no separate management UI.

## Decisions (locked)

- **Role source:** every human in `getChatAdministrators` (owner + all
  admins) is an admin. Bots are skipped. Synced at `/start`, `/jemaw`, and
  bot-join. Fallback: if the admin list can't be read, the `/start`-runner
  becomes admin so there is always ≥1.
- **Admin-only actions:** reset ledger; edit/remove expenses created by
  others; change group settings (currency, name); deactivate/remove members.
- **Member rights:** any member can add expenses and edit/remove **their own**
  (by `createdByMemberId`). Editing/removing others' requires admin.
- **Reset scope:** clears this group's `expenses, expense_shares,
  settlements, suggestions, messages, ai_runs`; keeps the group and members.
- **Reset confirm:** simple two-step confirm modal (danger button + cancel).
  No typed confirmation, no server snapshot.

## Section 1 — Data model & role source

- Add `members.role` enum `["admin","member"]`, `NOT NULL default "member"`.
  New Drizzle migration; existing rows default to `member`, next sync promotes.
- New repo helper `setMemberRole(db, groupId, telegramUserId, role)`.
- `seedAdmins`:
  1. fetch `getChatAdministrators`,
  2. upsert each human (existing behaviour),
  3. promote everyone in the admin set to `admin`.
- **Demotion** (admin→member for anyone no longer a TG admin) happens **only**
  when a non-empty admin list was fetched successfully, so a transient read
  failure never strips everyone's admin.
- Fallback: in the `/start` handler, if `seedAdmins` could not read any admin,
  set the runner's role to `admin`.

## Section 2 — API surface & enforcement

All enforcement is server-side via `req.jemaw.member` (verified initData;
client cannot forge a role).

- Guard `requireAdmin(req, reply): boolean` → 403 when `member.role !== "admin"`.
- **`POST /api/groups/:id/reset`** (new, admin-only): transaction clears
  `ai_runs, suggestions, settlements, expense_shares, expenses, messages` for
  the group; keeps group + members; returns fresh group state.
- **`PATCH /api/groups/:id`** (currency/name): add `requireAdmin`.
- **Expense `PATCH` / `void`:** allow if admin OR
  `expense.createdByMemberId === member.id`; else 403.
- **Member deactivate/remove:** add `requireAdmin`.
- DTOs: add `role` to `MemberDto`; add caller convenience `isAdmin: boolean`
  to `GroupDto`. App uses `isAdmin` only to show/hide; server re-checks.

## Section 3 — App UI

- `GroupDto.isAdmin` drives visibility. Non-admins simply don't see admin-only
  controls; if they somehow call one, the server returns 403 (handled
  gracefully).
- **Settings:** new **Danger zone** section, admin-only, with **Reset group
  data** → two-step confirm modal → `POST .../reset` → invalidate all queries.
- **Expense detail:** show Edit/Remove only when admin or the creator.
- **Group settings (currency/name):** disabled/hidden for non-admins.
- New hook `useResetGroup()` (mutation) invalidating the full ledger on success.

## Section 4 — Error handling & testing

- Reset runs in one transaction; partial failure rolls back.
- 403s from admin routes surface a brief inline message, never crash.
- Tests:
  - schema/migration applies; role defaults to member.
  - `seedAdmins` promotes the full admin set; no demotion on empty/failed read;
    `/start` fallback promotes the runner.
  - `requireAdmin` returns 403 for members, passes for admins.
  - reset clears the six tables and keeps group+members.
  - expense edit/remove ownership rule (own allowed, others' 403 unless admin).
- Existing app tests stay green; add a Settings danger-zone render test gated
  on `isAdmin`.

## Out of scope

- Manual promote/demote UI (roles come from Telegram).
- Server-side snapshot/restore of reset data.
- Cross-group/global roles (roles are per group).
