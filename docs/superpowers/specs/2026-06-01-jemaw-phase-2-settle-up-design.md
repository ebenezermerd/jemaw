# Jemaw — Phase 2: Settle-up + Edit/Void (Design Spec)

**Date:** 2026-06-01
**Builds on:** Phase 1 (manual ledger, balances, history, auth, API).
**Source of truth:** `JEMAW_PLAN.md` §6 (flow C), §13.5–13.7, §14 (algorithm).

---

## 1. Goal & Done-Criteria

Phase 2 makes balances *resolvable* and expenses *editable*. Done when:

1. **Settle-up algorithm** computes the minimum-transactions plan from current
   balances (greedy, integer cents). Pure + unit-tested.
2. **Settle screen** shows the transfer plan (`from → to: amount`).
3. **Mark-as-paid** is enabled only on lines where the **current user is the
   debtor** (`from == me`). Tapping opens a **confirmation sheet**; on confirm
   the server clamps to the live debt and inserts a `settlements` row.
4. **Settlements feed balances**: a paid settlement shifts the pair's net
   positions; when everyone nets zero the screen shows "Everyone's even."
5. **Edit expense** updates fields + recomputes shares; balances reflect it.
6. **Void expense** sets `voided_at` (soft delete); it drops from
   balances/history but remains auditable.
7. **History** shows settlement rows alongside expenses.
8. `pnpm typecheck` + `pnpm test` green; settle algorithm + clamped mark-paid +
   edit/void covered by tests (incl. a DB integration test).

**Not in Phase 2:** Gemini/suggestions (Phase 3), Framer Motion (Phase 4).

---

## 2. Domain logic (pure, unit-tested)

### settle.ts — minimum-transactions plan (plan §14)
Input: `[{ memberId, netCents }]` (from balances, already including paid
settlements). Output: `[{ fromMemberId, toMemberId, amountCents }]`.

```
1. Split into creditors (net > 0) and debtors (net < 0).
2. Sort both by magnitude desc.
3. While both non-empty:
   - take largest creditor C and largest debtor D
   - t = min(C, |D|); emit { from: D, to: C, amount: t }
   - reduce both by t; drop any that hit 0
4. Return transfers.
```
O(n log n); minimum or near-minimum for groups < ~12 (plan §14). Deterministic
tie-break by memberId so output is stable/testable.

### balances.ts — extend to include settlements
`net(member) = (paid as payer) − (their shares) − (settlements they paid as
`from`) + (settlements they received as `to`)`.
A paid settlement Mia→Sara €42.50 moves Mia's net +4250 and Sara's −4250
(reducing the debt). Invariant: all nets still sum to 0.

---

## 3. Mark-as-paid — flow & clamping

UI line: `from → to: amount` (debtor pays creditor).

- The **Mark as paid** button is enabled only when `from === currentMember`.
- Tap → **confirmation sheet** (plan §13.6):
  > "Confirm you sent €42.50 to Sara? This only records it — no money moves
  > through Jemaw."  **[Yes, mark paid]** / **[Not yet]**
- On confirm → `POST /api/groups/:id/settlements` `{ toMemberId }` (the server
  decides the amount, not the client).

**Server (clamp to current debt):**
1. Recompute live balances + the settle plan now.
2. Find the transfer where `from === currentMember && to === toMemberId`.
3. If none (debt already cleared / changed), return 409 with the refreshed
   plan so the UI updates.
4. Else insert `settlements { groupId, fromMemberId=current, toMemberId,
   amount=clampedCents, currency, markedPaidAt=now, markedPaidByMemberId=current }`.
5. Return the new balances + plan.

This prevents over-settling if an expense was added after the screen loaded.

---

## 4. Edit / Void expenses

### Edit — `PATCH /api/groups/:id/expenses/:expenseId`
Body: same shape as create (description, amount, payer, splitType, splitWith,
shares/exact). Server:
1. Load expense; 404 if missing, 409 if already voided.
2. Recompute shares via `computeSplit` (cents-safe).
3. In a transaction: update the expense row, delete old `expense_shares`,
   insert new ones. Set `source` to `ai_edited` only if it originated from AI;
   manual stays `manual`.
4. Return the updated expense. Balances recompute on next read.

### Void — `POST /api/groups/:id/expenses/:expenseId/void`
Sets `voided_at = now`. Idempotent (voiding a voided expense → 409). Voided
expenses are excluded from balances (already filtered in `listLiveExpenses`)
and shown distinctly (or hidden) in history.

> Guard: editing/voiding an expense after settlements exist can make a paid
> settlement exceed the new debt. Phase 2 allows it (balances simply reflect
> the new reality; a member may end up slightly over/under). A "settlement
> exceeds debt" reconciliation is noted as a future refinement, not built now.

---

## 5. API additions

| Method | Path | Body / behavior |
|---|---|---|
| GET | `/api/groups/:id/settle` | live transfer plan `[{from,to,amount}]` |
| POST | `/api/groups/:id/settlements` | `{ toMemberId }` → clamp + insert; 409 if stale |
| GET | `/api/groups/:id/settlements` | list paid settlements (for history) |
| PATCH | `/api/groups/:id/expenses/:expenseId` | edit + recompute shares |
| POST | `/api/groups/:id/expenses/:expenseId/void` | soft-delete |

Balances (`GET /balances`) and history (`GET /history`) extend to include
settlements. All behind the existing initData auth hook; mark-paid additionally
asserts `from === req.jemaw.member`.

New shared types: `SettlementDto`, `TransferDto`, `CreateSettlementInput`,
and history rows gain a settlement variant.

---

## 6. Mini App screens

### Settle (`/settle`, plan §13.6)
- Header "To zero everyone out:" + the transfer list.
- Each line: `from → to` (avatars) + amount; **Mark as paid** button enabled
  only when `from === me`, disabled otherwise (with a caption "only [from] can
  mark this").
- Tap → confirmation **bottom sheet** with the exact copy from §3.
- On success: balances tick to new values; if all even → celebration empty
  state "Everyone's even." (motion polish is Phase 4; Phase 2 = CSS only).
- 409 stale → toast "Balances changed — here's the updated plan" + refresh.

### Expense detail (`/expense/:id`) — now editable
- Phase 1 was read-only. Phase 2 adds Edit (reuses the Add form, prefilled) and
  a **Void** action (danger, with a confirm modal: "Void this expense? It will
  be removed from balances.").

### History — settlement rows
- Add a settlement row type: `from → to  amount  ✓ paid` with an arrow icon,
  distinct from expense rows. Member filter intersects settlements too.

### Tab bar
- Add the **Settle** tab (Phase 1 had Balances/History/Add/Settings).
  Final tabs: Balances · Settle · History · Add (Settings via header gear).

---

## 7. Testing

- **settle.ts**: classic plan (creditors/debtors) → minimal transfers; sums
  balance to zero; single debtor/creditor; already-even → empty; tie-break
  determinism.
- **balances.ts**: settlements shift nets correctly; zero-sum invariant holds
  with settlements present.
- **mark-paid clamping** (integration, DB): create expenses → settle plan →
  POST settlement → balances reflect it; add an expense mid-flow → POST clamps
  to current debt; non-debtor POST → 403; stale/cleared → 409.
- **edit/void** (integration): edit recomputes shares + balances; void drops
  from balances; void-twice → 409.
- App: Settle renders plan, button disabled for non-debtor; confirm sheet flow.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Stale plan over-settles | Server recomputes + clamps on mark-paid (§3); 409 on stale. |
| Edit after settlement breaks invariant | Allowed in v1; balances reflect reality; reconciliation deferred (noted §4). |
| Non-debtor marks paid | Server asserts `from === current member` (403 otherwise). |
| Float drift in plan | Integer cents throughout; zero-sum invariant test. |

---

## 9. Build order

1. `settle.ts` + tests; extend `balances.ts` + tests.
2. Settlement repo fns + API (`/settle`, POST/GET `/settlements`).
3. Edit/void repo fns + API.
4. Integration tests (clamp, edit, void).
5. Mini App: Settle screen + confirm sheet; editable expense detail; history
   settlement rows; Settle tab.
6. Typecheck + test + (optional) redeploy.
