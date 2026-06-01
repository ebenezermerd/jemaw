# Jemaw — AI Settlements + Swipe Gestures (Design Spec)

**Date:** 2026-06-01
**Builds on:** Phase 3 (Gemini scan) + the settle-up flow.

---

## 1. Goal

1. The Gemini scan also detects **settlement intent** in chat ("I paid Sara back
   200 for the cab") and surfaces it as a **settlement suggestion** to confirm.
2. Suggestion rows: **right-drag → Add/confirm**, **left-drag → remove (with a
   confirmation dialog)**.

---

## 2. Data model

`suggestions` gains:
- `kind` enum `suggestion_kind` (`'expense' | 'settlement'`), default `'expense'`.
- `from_member_id uuid null`, `to_member_id uuid null` (settlement parties).
- `amount` already nullable-capable (numeric); for vague settlements the amount
  may be null until the user fills it in.

Migration: add the enum + columns; existing rows default to `expense`.

---

## 3. Gemini output (scanSchema)

Response gains a parallel array:
```
settlements: [{
  confidence, from_telegram_id, to_telegram_id,
  amount (number | null), currency,
  evidence_message_ids, reasoning
}]
```
Prompt update (§6): teach the model to separate **expenses** (a cost incurred)
from **settlements/paybacks** (one member paying another back). Never invent
amounts; if the amount isn't stated, return `amount: null`.

Thresholds reuse `tierFor`. Telegram→member mapping reuses the existing logic;
unknown members drop the settlement.

---

## 4. Scan persistence

In `scanGroup`, after expense suggestions, process `settlements`:
- map from/to telegram ids → member ids (drop if unknown)
- drop `< 0.5` confidence
- insert as `suggestions` rows with `kind='settlement'`, `from_member_id`,
  `to_member_id`, `amount` (decimal or null), `evidence_message_ids`,
  `reasoning`, `status='pending'`.

`split_with`/`split_type` are not meaningful for settlements; store `[]`/`equal`
sentinels (schema requires non-null), ignored by the settlement path.

---

## 5. API

- `GET /suggestions` returns each suggestion's `kind` + (for settlements)
  `fromMemberId`, `toMemberId`, `amount` (string|null).
- `POST /suggestions/:id/confirm`:
  - if `kind='expense'` → existing path (create expense).
  - if `kind='settlement'`:
    - require an amount (from the suggestion, or supplied in the body for vague
      ones): `{ amount?: string }`.
    - recompute the live plan; **clamp** the recorded amount to the current debt
      between from→to (same as manual mark-as-paid). If no debt → 409 with a
      message ("already settled / no debt"). If mentioned amount > debt → record
      the clamped (debt) amount.
    - insert a `settlements` row (marked paid now, by the confirming member),
      resolve the suggestion `confirmed`.
- `POST /suggestions/:id/dismiss` unchanged.

New shared types: `SuggestionDto` gains `kind`, `fromMemberId`, `toMemberId`,
`amount: string | null`; `ConfirmSuggestionInput { amount?: string }`.

---

## 6. UI

**Ready-to-settle tab (Home + Settle):** AI settlement suggestions render at the
top (evidence + confidence), each with **Confirm** (records the settlement,
clamped) and, for vague ones, an inline amount field before confirm. Below them,
the computed transfers remain.

**Suggestion rows (expenses + settlements):**
- **Right-drag past threshold → Add/confirm** (the row's primary action).
- **Left-drag past threshold → confirmation dialog** ("Remove this suggestion?")
  → on confirm, dismiss.
- Buttons remain for non-touch / accessibility.

A shared `ConfirmDialog` (reuse the Modal motion component).

---

## 7. Testing

- scanSchema: settlements array parses; amount null allowed; bad dropped.
- scan (mocked Gemini): a settlement mention → settlement suggestion row;
  unknown member dropped; expense vs settlement separated.
- API: confirm settlement clamps to debt; 409 when no debt; vague (null amount)
  requires body amount; dismiss works.
- App: suggestion renders kind; left-drag shows the confirm dialog; right-drag
  confirms.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Model confuses expense vs settlement | Explicit prompt contrast + examples; confidence gate; always confirm. |
| Over-settling from chat | Clamp to current debt on confirm (reuse manual logic); 409 on no debt. |
| Accidental swipe | Threshold + velocity gate; left-drag requires a dialog confirm. |
| Vague amount | amount null → low-confidence card with inline amount entry. |

---

## 9. Build order

1. Migration (kind + member/amount columns) + schema + shared types.
2. scanSchema + prompt; scan settlement mapping/persist + tests.
3. API: confirm settlement (clamp) + list kind + tests.
4. UI: settle suggestions in tab + confirm/amount; swipe right=add / left=remove
   dialog.
5. Typecheck + test + build; deploy bot + app.
