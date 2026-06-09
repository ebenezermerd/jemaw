# Persisted AI Group-State Summary — Design

**Date:** 2026-06-09
**Status:** Approved, ready for implementation

## Goal

Make AI scans much faster and more precise by giving the model a compact,
always-current **state summary** of the group (balances, open debts, recent
items) that it reads on every scan, instead of re-deriving the full ledger and
re-serializing it each time. Combined with the already-shipped changes (10s
throttle, gemini-2.0-flash, Groq backend) and the reduced 10-message window,
this minimizes both the prompt size and the per-scan DB/compute work.

## Decisions (locked)

- **Summary content:** balances + open debts + recent expenses/settlements.
- **Refresh strategy:** recompute on every ledger change; scan is read-only.
- **Consistency:** version stamp (expense + settlement counts); scan verifies
  and self-heals on mismatch or missing summary.
- **Message window:** last 10 messages (already reduced from 50).

## Section 1 — Shape & storage

Stored in the existing `groups.settings` jsonb under `aiSummary` (no migration):

```ts
interface AiSummary {
  version: { expenses: number; settlements: number }; // consistency stamp
  currency: string;
  balances: { name: string; net: string }[];
  openDebts: { from: string; to: string; amount: string }[];
  recentExpenses: { desc: string; amount: string; payer: string }[]; // ~5
  recentSettlements: { from: string; to: string; amount: string }[]; // ~5
  updatedAt: string; // ISO
}
```

Small (a few hundred tokens), precise (real numbers), and stable between scans.

## Section 2 — Maintenance (refresh on write)

New module `packages/bot/src/ai/summary.ts`:

- `computeGroupSummary(db, groupId): Promise<AiSummary>` — the balances →
  settle-plan logic currently inline in `scan.ts`, moved here and reused.
- `refreshGroupSummary(db, groupId): Promise<AiSummary>` — compute + persist to
  `groups.settings.aiSummary` (merge, don't clobber other settings keys).
- Stamp with current expense + settlement counts.

Called from every ledger-mutating path (best-effort, never blocks the write):
create/edit/void expense, create settlement, confirm suggestion, group reset
(reset clears the summary).

## Section 3 — Scan uses it (read-only + self-heal)

In `scanGroup`:
1. Read `groups.settings.aiSummary`.
2. Verify: count expenses + settlements; if they match `version`, use as-is.
3. Self-heal: if missing or stale, call `refreshGroupSummary` once, use result.

Removes the 2 full-ledger computations and the redundant queries from the hot
path. The prompt sends the 10 recent messages + this summary.

## Section 4 — Error handling & testing

- `refreshGroupSummary` is wrapped at call sites; failure logs and never blocks
  the user action — the next scan's self-heal recovers.
- Reset clears `aiSummary`.
- Tests:
  - summary shape + stamp correctness;
  - stamp mismatch → exactly one recompute; in-sync → no recompute;
  - summary balances equal the live `computeBalances` result;
  - reset clears the summary;
  - existing scan tests still pass (mock client unaffected).

## Out of scope

- AI-written free-text memory (rejected — less numerically precise).
- Cross-group/global summaries (summary is per group).
- Schema migration (reusing `groups.settings` jsonb).
