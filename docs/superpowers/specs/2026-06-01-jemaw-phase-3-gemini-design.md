# Jemaw — Phase 3: Gemini Scan Loop (Design Spec)

**Date:** 2026-06-01
**Builds on:** Phase 1 (ledger, message capture) + Phase 2 (settle).
**Source of truth:** `JEMAW_PLAN.md` §4 (triggers), §6 (Gemini), §10 (rate limit),
§11 (suggestions tab), §13.3 (inbox). Schema (`suggestions`, `ai_runs`) exists.

---

## 1. Goal & Done-Criteria

Typing "jemaw" in a group surfaces AI-drafted expense suggestions the group
confirms with a tap. Done when:

1. **Trigger**: keyword regex `/(?<![a-z0-9])jemaw(?![a-z0-9])/i` + `/jemaw`
   command kick a scan (rate-limited to once per 60s per group).
2. **Scan** (in-process async, DB-backed): gather recent messages since the last
   scan (≤50), call Gemini Flash, validate strict JSON, write `suggestions` +
   an `ai_runs` row. Failures are recorded, never crash the bot.
3. **Suggestions API**: list pending, confirm (→ creates an expense), edit
   (→ creates an edited expense), dismiss.
4. **Suggestions tab** in the Mini App: cards with evidence, confidence strip,
   confirm/edit/dismiss; polls while a scan is in flight.
5. **Pinned message** reflects the count ("Open Jemaw • N suggestions").
6. **Guardrails**: amounts must come from messages; every suggestion cites
   evidence message ids; members limited to the group; confidence thresholds
   (≥0.7 normal, 0.5–0.7 low-confidence, <0.5 dropped).
7. `pnpm typecheck` + `pnpm test` green; scan parsing, thresholds, confirm flow
   tested with a **mocked Gemini client** (no network in tests).

**Deferred:** per-user DM dispatcher (pinned-message feedback only), SSE
(polling instead), `gemini-2.5-pro`.

---

## 2. Architecture

```
group message ──▶ trigger detector (regex / /jemaw)
                       │  rate-limit (60s/group)
                       ▼
                 scanGroup() [async, in-process]
                   1. gather messages since last_scan_message_id (≤50)
                   2. build prompt (members, currency, recent expenses)
                   3. GeminiClient.suggest() → strict JSON
                   4. validate (zod) + threshold filter
                   5. write ai_runs + suggestions (tx)
                   6. update group.last_scan_message_id + pinned count
                       ▼
              Mini App suggestions tab (polls) ──▶ confirm/edit/dismiss
```

New bot files:
```
src/ai/
  geminiClient.ts     # interface + real impl (@google/generative-ai); mockable
  prompt.ts           # build the system + user prompt (plan §6)
  scanSchema.ts       # zod schema for Gemini's JSON output
  scan.ts             # scanGroup(): orchestrates a single scan
  rateLimit.ts        # per-group 60s gate (in-memory + ai_runs timestamp)
src/api/
  suggestions.ts      # routes folded into routes.ts (list/confirm/edit/dismiss)
```

---

## 3. Trigger detection (bot.ts)

- The existing `message:text` handler already captures messages + registers
  speakers. Add: if `text` matches the jemaw regex, call `maybeScan(group)`.
- `/jemaw` command → same `maybeScan`, plus refresh the pinned message.
- `maybeScan`: check the per-group rate limit; if allowed, fire
  `scanGroup(...)` without awaiting (fire-and-forget, errors logged).

Rate limit: in-memory `Map<groupId, lastScanMs>` (good enough for one
instance); also guarded by the latest `ai_runs.created_at` so a restart can't
spam. 60s window (plan §10).

---

## 4. Gemini integration (plan §6)

**Client interface** (so tests mock it, deploy uses the real one):
```ts
interface GeminiClient {
  suggest(input: ScanPromptInput): Promise<unknown>; // raw JSON value
}
```
Real impl uses `@google/generative-ai`, model `gemini-2.5-flash`,
`responseMimeType: application/json`, low temperature. Reads `GEMINI_API_KEY`.

**Prompt** (plan §6 system prompt, verbatim intent): members (names + ids),
default currency, last ≤50 messages (sender + timestamp), summary of last 5
confirmed expenses. Forbids inventing amounts; requires evidence ids.

**Output schema** (zod, plan §6):
```
{ suggestions: [{ confidence, description, amount, currency,
  payer_telegram_id|null, split_type, split_with:[telegram_id...],
  shares|null, evidence_message_ids:[...], reasoning }],
  scan_window: { from_message_id, to_message_id } }
```
Anything that doesn't parse is dropped (not retried). Telegram ids in the
output are mapped back to member ids; unknown ids drop that suggestion.

**Thresholds:** ≥0.7 normal card; 0.5–0.7 low-confidence (reasoning shown);
<0.5 dropped silently.

**Cost/secrets:** `GEMINI_API_KEY` validated in env (optional until Phase 3
deploy), stored as a Cloud Run secret. No usernames/phone numbers sent (plan
§15) — only display names + message text.

---

## 5. Persistence

- `ai_runs`: one row per scan — trigger type, from/to message id, token counts
  (if available), duration, status (`success|parse_error|api_error`),
  `raw_response` (jsonb, for debugging; no PII beyond names).
- `suggestions`: one row per surfaced suggestion (status `pending`), linked to
  the `ai_run_id`, storing `payer_member_id` (mapped), `split_with` (member
  ids), `evidence_message_ids`, `confidence`, `reasoning`.
- On scan success, advance `groups.last_scan_message_id` to the window's `to`.

---

## 6. Suggestions API (under /api/groups/:groupId, authed)

| Method | Path | Behavior |
|---|---|---|
| GET | `/suggestions` | list `pending` suggestions (+ a `scanning` flag) |
| POST | `/suggestions/:id/confirm` | create an expense from it (`source=ai_confirmed`), mark `confirmed` |
| POST | `/suggestions/:id/edit` | body = expense input; create `ai_edited` expense, mark `edited` |
| POST | `/suggestions/:id/dismiss` | mark `dismissed` |

Confirm/edit reuse the Phase 1/2 split + expense-creation path. Each records
`resolved_by_member_id` + `resolved_at`. New shared types: `SuggestionDto`,
`SuggestionsResponse`.

---

## 7. Mini App — Suggestions (plan §13.3)

- New **Suggestions** tab (badge = pending count). Home becomes Suggestions when
  any pending exist (plan §13.2), else Balances.
- Card per suggestion: description, amount, payer, split summary, the cited
  evidence message quote, confidence strip (accent ≥0.7 / warn 0.5–0.7), and
  `[Dismiss] [Edit] [✓ Add]`.
- Polls `GET /suggestions` every 4s while `scanning` is true (and on open);
  stops when idle. Skeleton cards during a scan (plan §13.3).
- Confirm → optimistic remove + balances invalidate. Edit → opens the expense
  editor prefilled. Dismiss → remove.

Tabs become: Suggestions · Balances · Settle · History (Add via a + ; Settings
via gear). Keep it to 4 visible tabs; "Add" moves to a header action or stays —
final: Suggestions · Balances · Settle · History, with Add as a header "+".

---

## 8. Testing (no network)

- **scanSchema**: valid Gemini JSON parses; malformed dropped; threshold
  filtering (drop <0.5, flag 0.5–0.7).
- **prompt**: includes members/currency, excludes usernames/phone.
- **scan.ts** (mocked GeminiClient): a fake response → correct `suggestions` +
  `ai_runs` rows; api_error path records `api_error` and surfaces nothing;
  telegram-id→member mapping; unknown id drops the suggestion.
- **rateLimit**: second call within 60s is blocked.
- **suggestions API** (integration, mocked scan data inserted): confirm creates
  an expense + flips status; dismiss; edit.
- App: suggestion card renders confidence + evidence; confirm removes it.

---

## 9. Risks (plan §18)

| Risk | Mitigation |
|---|---|
| Hallucinated amounts | Prompt forbids; evidence ids required; confidence gate; always confirm. |
| Bad JSON | zod validate; drop non-parsing; record `parse_error`; never crash. |
| Privacy mode hides messages | Scan yields nothing; onboarding warns; capture already degrades gracefully. |
| Spam "jemaw jemaw" | 60s/group rate limit; pinned updates instantly, one scan. |
| PII to model | Only names + text sent; no usernames/phone/telegram ids in prompt text. |
| Key in wrong project | GEMINI_API_KEY is project-agnostic; stored as Cloud Run secret. |

---

## 10. Build order

1. `geminiClient` interface + mock; `scanSchema` (zod) + tests.
2. `prompt` builder + tests.
3. `scan.ts` orchestration + `rateLimit` + tests (mocked client).
4. Trigger wiring in bot.ts; pinned-count update.
5. Suggestions API (list/confirm/edit/dismiss) + integration tests.
6. Mini App suggestions tab + polling.
7. env: optional `GEMINI_API_KEY`; real client wired behind it.
8. Typecheck + test. Deploy wires the secret.
