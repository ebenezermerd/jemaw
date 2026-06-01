# Jemaw — Home Card & UI Polish (Design Spec)

**Date:** 2026-06-01
**Builds on:** Phases 1–4 (deployed).
**Scope:** Presentation + one read endpoint. No data-model changes.

---

## 1. Goal

A more app-like, personal home and refined entry/settings:
1. Center floating "+" nav button (mobile-app FAB) in the tab bar.
2. Credit-card-style summary card on Home showing the **current member's net** as
   the focal number plus secondary stats.
3. Date picker for an expense's `occurred_at` (Add + edit).
4. Payer selection refined (already a chip row; ensure it's clear).
5. Suggestion card redesign.
6. Advanced-but-minimal Settings: **theme (dark/light/system)** + currency
   selector + members management.

Done when: typecheck + tests + build green (incl. a summary-endpoint test);
deployed; user confirms the look.

---

## 2. Backend — one new endpoint

`GET /api/groups/:groupId/me/summary` (authed). Returns the calling member's
standing, computed from the same `loadBalances` + live expenses:

```ts
interface MeSummaryDto {
  memberId: string;
  displayName: string;
  net: string;          // signed decimal — focal number
  totalPaid: string;    // sum of expenses this member fronted (live)
  totalShare: string;   // sum of this member's shares (live)
  expenseCount: number; // # live expenses they're involved in
  currency: string;
}
```

Pure-ish: reuse `loadBalances` for `net`; iterate live expenses for paid/share/
count. New shared type `MeSummaryDto`. New hook `useMeSummary`.

---

## 3. Home summary card (§12 tokens)

New `Home` route at `/` (replaces the Navigate-to-balances default). Renders the
card, then the Suggestions inbox if any pending else the Balances list (plan
§13.2 conditional home).

**Card** (`ui/SummaryCard.tsx`):
- Container: gradient `linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 30%, var(--surface)) 60%, var(--surface) 100%)`, radius `--r-xl`, padding 20, min-height 180, dark text on the accent end handled via a subtle overlay for contrast.
- Top row: group name (small, issuer-like) left; a chip glyph (rounded rect with two pads, CSS) right.
- Focal: **net** in `display` type, tabular, animated (AnimatedNumber), label "you're owed" / "you owe" / "you're even".
- Bottom row: cardholder = your display name (uppercase, tracked) left; three mini-stats right — Paid, Share, Expenses.
- Reduced-motion safe (AnimatedNumber already handles it).

Contrast note: text on the gradient uses `#0B0B0C` near the accent end and
`--text` toward the surface end; we keep the focal number on the darker portion
for legibility, or use a translucent scrim. Implementer picks the legible option.

---

## 4. Center FAB nav (`ui/TabBar.tsx`)

Five slots: Suggestions · Balances · **[+]** · Settle · History. The middle
slot is a raised circular accent button (56px, lifts ~16px above the bar, soft
ring) that navigates to `/add`. Side tabs unchanged (icon+label, active pill).
The previous header "+" is removed (the FAB replaces it). Settings stays in the
header gear.

Reduced motion: FAB has the same tap feedback rules as buttons.

---

## 5. Add + ExpenseDetail — date picker & payer

- **Date field**: a styled control bound to `occurredAt`. Use a native
  `<input type="date">` (reliable in Telegram WebView), themed to tokens,
  defaulting to today. On submit, send ISO at local midnight.
- **Payer**: already a horizontal chip selector; keep, ensure the selected chip
  is obvious (accent border + soft bg). No structural change, just confirm.
- ExpenseDetail gains the same date field (it currently omits it).

---

## 6. Suggestion card redesign (`routes/Suggestions.tsx`)

Cleaner hierarchy:
- Confidence as a small **corner pill** (top-right): accent "AI" for normal,
  warn "low" for low-confidence (replaces the left strip + inline pill).
- Description (body-strong) + amount (prominent, right) on the first row.
- Payer + split summary as caption.
- Evidence reasoning in a quoted block (left border, italic, muted).
- Action row: `Dismiss` (ghost) · `Edit` (ghost) · `✓ Add` (primary), unchanged
  behavior; keep swipe-to-dismiss + stagger from Phase 4.

---

## 7. Settings redesign (`routes/Settings.tsx`)

Minimal, sectioned, editable:
- **Appearance**: theme segmented control — System · Light · Dark. Persists to
  `localStorage("jemaw-theme")`; applied at boot (overrides Telegram default
  when set). New `motion`/util `applyTheme(pref)`.
- **Group**: name (read-only), currency selector (`<select>` of common
  currencies) — disabled with a caption "locked — expenses exist" when
  `hasExpenses`. PATCH `/api/groups/:id` currency (new tiny route) only allowed
  when no expenses.
- **Members**: refined rows (avatar + inline rename), add-member input.

New backend: `PATCH /api/groups/:groupId` `{ defaultCurrency }`, rejected (409)
if the group already has expenses. New hook `useUpdateGroup`.

---

## 8. Files

```
shared/src/types.ts            +MeSummaryDto, +UpdateGroupInput
bot/src/api/mappers.ts         +toMeSummaryDto helper (or inline)
bot/src/api/routes.ts          +GET me/summary, +PATCH group currency
bot/src/repo.ts                +updateGroupCurrency
app/src/lib/hooks.ts           +useMeSummary, +useUpdateGroup
app/src/lib/theme.ts           applyTheme(pref) + persistence
app/src/ui/SummaryCard.tsx     the gradient card
app/src/ui/TabBar.tsx          center FAB layout
app/src/routes/Home.tsx        new home (card + conditional inbox/balances)
app/src/routes/Add.tsx         date picker
app/src/routes/ExpenseDetail.tsx  date picker
app/src/routes/Suggestions.tsx redesigned card
app/src/routes/Settings.tsx    theme + currency + members
app/src/App.tsx                route wiring; remove header "+"
app/src/main.tsx               applyTheme(stored) at boot
```

---

## 9. Testing & verification

- Backend: `me/summary` integration test (paid/share/net/count correct);
  currency PATCH rejected once expenses exist (409), allowed before.
- App: SummaryCard renders the focal number + stats; theme util returns the
  right `data-theme`; existing suite stays green.
- Build succeeds; **user eyeballs** the card/FAB/settings on device (visual).

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Gradient text contrast | Keep focal number on the darker gradient portion / scrim; test on device. |
| Native date input ugly in WebView | `type=date` is the most reliable cross-platform; themed; acceptable for v1. |
| Theme override vs Telegram | Stored pref wins; "System" falls back to Telegram's colorScheme. |
| FAB overlaps content | Tab bar height accounts for the raised FAB; content padding-bottom adjusted. |
| Currency change corrupts past expenses | PATCH hard-blocks once any expense exists (409). |

---

## 11. Build order

1. Backend: `me/summary` + currency PATCH + repo + types + tests.
2. theme util + Settings (theme/currency/members).
3. SummaryCard + Home route + hook.
4. TabBar center FAB; App wiring; remove header "+".
5. Add/ExpenseDetail date picker; Suggestion card redesign.
6. Typecheck + test + build. Commit atomic → PR → deploy Mini App (+ bot for the
   two new endpoints).
