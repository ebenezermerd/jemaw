# Settle-up: silent failures, already-settled suggestions, and cents residual

## Problem

Three related defects on the mini app's settle-up flow:

1. **Settle fails silently after a manual settlement.** When a user has already
   settled a pair by hand and then tries to settle again via the AI-suggested
   settle form, the request is rejected by the API but the user sees nothing —
   no error, no toast. The button appears to do nothing.

2. **An already-settled settlement suggestion still presents a normal form.**
   The suggestion card and the settle form have no awareness that the pair is
   already even. The "Settle" action just posts and hits a 409. The user is
   never told to dismiss it instead.

3. **Cents residual leaves an expense not-fully-covered.** When the recorded
   settlement amount rounds such that a sub-tolerance remainder (< 3.00) is left
   on an expense, the allocation is capped at the literal residual, so the
   expense can stay just-uncovered in the ledger even though the user meant to
   clear it.

## Root causes

- **API client throws a plain `Error`.** `packages/app/src/lib/api.ts` throws
  `new Error("<status>: <body>")` on non-2xx. `SettleForm.submit()` reads
  `(err as {response?: {...}}).response`, which is always `undefined`. So the
  `maxAllocatable` over-pay branch is dead code and every other error is
  swallowed by an empty `else`.

- **"no current debt" rejection.** `recordSettlementFromInput`
  (`packages/bot/src/api/routes.ts`) rejects with
  `"no current debt between these members"` (409) when no transfer exists for
  the pair — exactly the already-settled case.

- **Allocation capped at residual.** `recordSettlementFromInput` allocates
  `Math.min(remaining, residual)` per expense and records
  `paidCents = Math.min(requestedCents, maxAllocatableCents)`, so a few-cent
  rounding remainder is never cleared, even though `isShareCovered` tolerates
  up to `COVERAGE_TOLERANCE_CENTS` (300).

## Design

### 1. Structured API errors + inline message (frontend)

- Add an `ApiError` class to `api.ts` carrying `status: number` and the parsed
  JSON `body` (so `body.error` and `body.maxAllocatable` are reachable). The
  `request()` helper parses the error body as JSON when possible and throws
  `ApiError` instead of a plain `Error`.
- In `SettleForm.tsx`, generalize the existing `overPayError` red-text slot into
  a single `formError` string. On submit failure:
  - If `body.maxAllocatable` is present → keep the existing behaviour (set the
    amount to the cap and show "Exceeds what you owe. Max: …").
  - Otherwise → show `body.error` verbatim (e.g. "This pair is already settled —
    nothing to record."), so the user always sees *why* it failed.
- No new toast dependency — this matches the app's current inline-error pattern
  and is the smallest reusable surface.

### 2. Already-settled settlement suggestion (frontend)

- A settlement suggestion is "already settled" when there is no current transfer
  for its `fromMemberId → toMemberId` pair. The settle plan
  (`useSettlePlan`) already exposes `transfers`; the Suggestions screen can read
  it to decide.
- In `Suggestions.tsx`, compute `alreadySettled` per settlement card from the
  plan's transfers. When true:
  - Render the card with a destructive/red border.
  - Replace the evidence block hint with "Already settled — you can dismiss this
    suggestion."
  - Disable the **Settle** button (keep **Dismiss** and **Edit** active).
- This pre-empts the 409 entirely for the common case while still letting the
  backend guard remain the source of truth.

### 3. Honor the "leave it" intent within tolerance (backend)

- In `recordSettlementFromInput`, when the requested amount covers the selected
  expenses' residuals within `COVERAGE_TOLERANCE_CENTS`, allocate the **full
  residual** for each selected expense rather than capping at the smaller
  requested remainder. Concretely: if
  `maxAllocatableCents - requestedCents <= COVERAGE_TOLERANCE_CENTS`, treat the
  payment as covering the selected expenses fully and allocate each expense's
  residual in full.
- The persisted settlement `amount` stays equal to what the user actually paid
  (`paidCents`), so balances still reflect reality; only the per-expense
  allocations are completed so `isExpenseCovered` returns true and no ghost
  sub-tolerance debt lingers.
- This is gated by the same tolerance already used elsewhere, so it never
  over-allocates beyond a few cents.

## Out of scope

- No global toast/snackbar system.
- No change to the over-pay rejection threshold or the tolerance constant.
- No change to the AI suggestion-generation logic.

## Testing

- Backend: extend `allocations.integration.test.ts` — a settlement that pays
  within tolerance of the full owed amount marks the selected expense covered
  (no residual transfer remains).
- Backend: a settle request for an already-even pair returns the
  "no current debt" 409 (unchanged) — confirms the frontend guard is additive.
- Frontend: type-check the structured-error and suggestion-flagging changes.
