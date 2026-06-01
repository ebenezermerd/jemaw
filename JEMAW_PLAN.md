# Jemaw

**A Telegram-native expense companion for friend groups.**
Complete product, engineering, and design plan — v1.0

---

## 0. One-line pitch

Drop "jemaw" in your group chat. A Mini App opens with AI-suggested expenses already drafted from the conversation. Confirm with a tap. Settle off-platform. Done.

---

## 1. Vision

Most expense-splitting apps fail because they live outside the conversation where expenses actually get discussed. People talk about money in their group chats — "I got the cab," "I'll cover dinner," "Sara owes me for the tickets" — then never open the separate app to log it. Jemaw closes that gap by living *inside* the group chat itself.

You don't switch apps. You don't enter amounts twice. You don't argue at the end of the trip. You mention Jemaw, Gemini reads the last few messages, and a curated list of suggested expenses appears in a Mini App. You confirm or dismiss. Balances update. When it's time to pay, Jemaw tells you the smallest set of transfers that zeroes everyone out. You pay each other off-platform, the way you already do, and tap "mark as paid."

Jemaw is the quiet bookkeeper that already heard the conversation.

---

## 2. Product principles

**Capture without friction.** The user already typed the information. We just read it.
**Confirm, never assume.** AI suggests; humans decide. No silent writes.
**Stay in Telegram.** No installs, no app store, no second login.
**Minimal surface.** Every screen does one thing. We add features by removing them.
**Off-platform settle.** We track who owes whom. You move money the way you already do.
**Motion as feedback.** Animation tells the user what just happened, never decorates.

---

## 3. Scope — v1

**In scope**
- Telegram bot installed in a group
- "jemaw" trigger keyword (case-insensitive, word-boundary regex)
- Telegram Mini App opened from the trigger or a slash command
- Gemini-powered chat parser that suggests expenses from recent messages
- Manual expense entry as a fallback
- Per-user balance ledger
- Settle-up screen with minimum-transactions algorithm
- "Mark as paid" for off-platform settlements
- Per-user private DMs for personal review (only to users who started the bot 1:1 once)
- Single currency per group, set at install
- History view with filter by member, date, status
- Onboarding flow that walks through privacy-mode setup

**Out of scope (deferred to v2+)**
- Payment processing or real money movement
- OCR receipt scanning
- Recurring expenses
- Multi-currency per group
- A web dashboard outside Telegram
- Phone notification scraping (removed from spec)
- Categories and budgeting

---

## 4. Triggers — how Jemaw wakes up

Jemaw listens for three classes of events:

**Keyword mention.** Any group message matching `/\bjemaw\b/i` is treated as a trigger. The bot does not reply with text noise — it edits a single pinned "Jemaw" message in the group (or sends one if none exists) that contains the Mini App button. The button text reflects state: "Open Jemaw" by default, "Open Jemaw • 3 suggestions" when there are pending items.

**Slash commands.** `/jemaw`, `/balance`, `/settle`, `/add`, `/help`. Each does what it says. `/jemaw` is identical to the keyword trigger.

**Inline button taps.** From the pinned message, from a DM, or from a confirmation prompt. Always opens the Mini App with deep-link context (e.g., directly to the suggestions tab).

**What "trigger" means internally.** A trigger does two things in parallel: it ensures the pinned button is current, and it kicks a Gemini scan of the last *N* messages since the previous scan (or last 50 if no prior). The scan runs in the background; if the user opens the Mini App before it finishes, the suggestions tab shows a skeleton state and streams results in.

**Privacy mode.** Telegram bots in groups, by default, only see messages that mention them or are commands. For Jemaw to see plain conversation, the bot owner must disable privacy mode in @BotFather (or the bot must be a group admin). The onboarding flow checks this and walks the installer through it.

---

## 5. Core user flows

**Flow A — Trip in progress, evening of day 1.**
The group has been chatting all day. Someone types "ok jemaw" in the chat. The pinned Jemaw message updates to "Open Jemaw • 4 suggestions." Sara taps it. The Mini App opens to a stack of four cards: "Lunch at Caffe Roma, you paid €52, split 4 ways," "Cab from station, Tom paid €18, split 3 ways," etc. She confirms two, edits one (different split), dismisses one (not a group expense). Balances update live behind the cards. She closes the app. The pinned message updates to "Open Jemaw • all caught up."

**Flow B — Manual entry, no chat context.**
Tom is at the bar. He taps the pinned message, hits the "+" in the Mini App, picks himself as payer, types 60, picks "equal split among all," confirms. Two seconds, no chat dance.

**Flow C — Settle-up at the end of the trip.**
Someone types "jemaw settle?" The pinned message updates. Anyone opens the Mini App, taps Settle. The screen shows three transfers: "Sara → Tom: €34," "Mia → Tom: €18," "Mia → Sara: €12." Each line has a Mark-as-Paid button that the *payer* taps after sending the money. Balances zero out as marks come in.

**Flow D — Personal private review.**
After a Gemini scan, Jemaw DMs each member privately: "I noticed 2 possible expenses involving you. Review?" The DM has an Open button. This stays out of the group so people aren't pinged for every suggestion.

---

## 6. AI integration — Gemini

**Model.** `gemini-2.5-flash` for parsing (cheap, fast, large context). `gemini-2.5-pro` only if a future feature needs deeper reasoning.

**Why Gemini Flash.** Cost-per-call rounds to fractions of a cent for a typical 50-message window. Latency is sub-second. 1M token context means we never truncate a group's history.

**Context strategy.** Each scan sends:
1. The system prompt (stable, cached)
2. The group's known members (names + Telegram user IDs)
3. The default currency
4. The last `min(50 messages, since last scan)` from the group, with sender names and timestamps
5. A summary of the last 5 confirmed expenses, so the model doesn't re-suggest known ones

**Output schema.** Gemini returns strict JSON. Anything that doesn't parse is dropped, not retried, not surfaced.

```json
{
  "suggestions": [
    {
      "confidence": 0.0,
      "description": "string",
      "amount": 0.00,
      "currency": "EUR",
      "payer_telegram_id": 123,
      "split_type": "equal" | "shares" | "exact",
      "split_with": [123, 456],
      "shares": null,
      "evidence_message_ids": [101, 103, 104],
      "reasoning": "string, max 200 chars"
    }
  ],
  "scan_window": { "from_message_id": 99, "to_message_id": 150 }
}
```

**Confidence thresholds.** ≥0.7 surfaces as a normal suggestion card. 0.5–0.7 surfaces as a "low-confidence" card with the reasoning visible by default. <0.5 is dropped silently.

**Anti-hallucination guardrails.**
- The prompt explicitly forbids inventing amounts not present in the source messages.
- Every suggestion must cite `evidence_message_ids`; the Mini App lets the user tap to see the original chat snippets.
- Members can only be those in the group at scan time.
- If the model is uncertain about the payer, `payer_telegram_id` is null and the card asks the user to pick.

**System prompt (v1 draft).**
> You are Jemaw, an assistant that extracts expense events from a Telegram group chat. Members will share meals, rides, tickets, and small purchases. Your job: from the messages provided, identify only the expenses that clearly happened, who paid, and who shares the cost. You must never invent amounts. Cite the message IDs that justify each suggestion. If a message mentions money but is hypothetical, joking, or about something other than a group expense, ignore it. If split is unclear, default to equal among all members present in the conversation. Output strict JSON matching the schema. No prose outside the JSON.

**Cost estimate.** A 50-message scan ≈ 2,000 input tokens + 500 output tokens. At Flash pricing this is well under a tenth of a cent. Even at 100 scans/day across many groups, monthly cost stays under $5.

---

## 7. Data model

```
groups
  id (uuid, pk)
  telegram_chat_id (bigint, unique)
  name (text)
  default_currency (text, 3-char)
  created_at (timestamptz)
  last_scan_message_id (bigint, nullable)
  pinned_message_id (bigint, nullable)
  settings (jsonb)

members
  id (uuid, pk)
  group_id (uuid, fk)
  telegram_user_id (bigint)
  display_name (text)
  username (text, nullable)
  is_active (bool)
  joined_at (timestamptz)
  unique(group_id, telegram_user_id)

expenses
  id (uuid, pk)
  group_id (uuid, fk)
  payer_member_id (uuid, fk)
  amount (numeric(12,2))
  currency (text, 3-char)
  description (text)
  created_by_member_id (uuid, fk)
  source ('manual' | 'ai_confirmed' | 'ai_edited')
  source_suggestion_id (uuid, fk, nullable)
  occurred_at (timestamptz)
  created_at (timestamptz)
  voided_at (timestamptz, nullable)

expense_shares
  id (uuid, pk)
  expense_id (uuid, fk)
  member_id (uuid, fk)
  share_amount (numeric(12,2))

settlements
  id (uuid, pk)
  group_id (uuid, fk)
  from_member_id (uuid, fk)
  to_member_id (uuid, fk)
  amount (numeric(12,2))
  currency (text, 3-char)
  marked_paid_at (timestamptz, nullable)
  marked_paid_by_member_id (uuid, fk, nullable)
  created_at (timestamptz)

suggestions
  id (uuid, pk)
  group_id (uuid, fk)
  ai_run_id (uuid, fk)
  confidence (numeric(3,2))
  description (text)
  amount (numeric(12,2))
  payer_member_id (uuid, fk, nullable)
  split_type (text)
  split_with (jsonb) -- array of member ids
  shares (jsonb, nullable)
  evidence_message_ids (jsonb)
  reasoning (text)
  status ('pending' | 'confirmed' | 'edited' | 'dismissed')
  resolved_at (timestamptz, nullable)
  resolved_by_member_id (uuid, fk, nullable)
  created_at (timestamptz)

ai_runs
  id (uuid, pk)
  group_id (uuid, fk)
  triggered_by_member_id (uuid, fk, nullable)
  trigger_type ('keyword' | 'command' | 'manual')
  from_message_id (bigint)
  to_message_id (bigint)
  input_tokens (int)
  output_tokens (int)
  duration_ms (int)
  status ('success' | 'parse_error' | 'api_error')
  raw_response (jsonb, nullable)
  created_at (timestamptz)

messages
  id (uuid, pk)
  group_id (uuid, fk)
  telegram_message_id (bigint)
  sender_telegram_user_id (bigint)
  text (text)
  sent_at (timestamptz)
  unique(group_id, telegram_message_id)
```

A rolling 30-day retention window deletes old `messages` rows; everything else persists.

---

## 8. Architecture

```
                     ┌──────────────────────┐
                     │   Telegram Servers   │
                     └──────────┬───────────┘
                                │ webhooks
                                ▼
        ┌────────────────────────────────────────────┐
        │  Bot Service  (Node + grammY, Fastify)     │
        │  • webhook handler                         │
        │  • trigger detector (regex + cmd parser)   │
        │  • pinned-message manager                  │
        │  • Mini App initData verifier              │
        │  • DM dispatcher                           │
        └──────┬────────────────────┬────────────────┘
               │                    │
               ▼                    ▼
        ┌──────────────┐     ┌─────────────────────┐
        │  Postgres    │     │  AI Worker (queue)  │
        │  (Neon)      │     │  • Gemini calls     │
        │              │◀────┤  • JSON validation  │
        │              │     │  • suggestion writes│
        └──────────────┘     └─────────────────────┘
               ▲
               │ REST / SSE
               │
        ┌──────────────────────────────────────────┐
        │  Mini App  (Vite + React + TS)           │
        │  served from Vercel                      │
        │  authenticated via Telegram initData     │
        └──────────────────────────────────────────┘
```

**Bot service** runs on Fly.io (shared-cpu-1x, ~$3/mo). Single instance is fine for v1; horizontal scaling later.

**Postgres** on Neon free tier; migration to paid only when storage matters.

**AI worker** can be in-process for v1 (a simple background job runner like `bullmq` with a small Redis or even in-memory). Move to a separate process when concurrency grows.

**Mini App** is a static SPA on Vercel. It calls the bot service over HTTPS with the user's `initData` in headers; the server validates the HMAC against the bot token, extracts the Telegram user ID, and authorizes from there.

---

## 9. Tech stack — final picks

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | One language across bot + Mini App |
| Bot framework | grammY | Modern, well-typed, great Mini App docs |
| HTTP server | Fastify | Fast, schema-validated, small |
| Mini App build | Vite | Fast HMR, tiny bundle |
| UI framework | React 18 | Mature, hooks-first |
| Styling | Tailwind CSS v4 | Utility-first, dark mode trivial |
| Animation | Framer Motion | Best-in-class layout animations + spring physics |
| Icons | Lucide | Clean, consistent line weights |
| DB | Postgres (Neon) | Boring, transactional, free tier |
| ORM | Drizzle | Type-safe, no codegen drama |
| AI | Google Gemini API (`gemini-2.5-flash`) | Cheap, fast, large context |
| Queue | bullmq + Redis (Upstash) | Free tier, simple |
| Hosting (bot) | Fly.io | $3/mo, global |
| Hosting (Mini App) | Vercel | Free, instant |
| Monitoring | Sentry (free tier) + Better Stack logs | Crash + log |

---

## 10. Bot commands & triggers

| Command | Behavior |
|---|---|
| `/start` (in group) | Onboarding: confirms privacy-mode status, posts pinned button, registers members |
| `/start` (in DM) | Personal onboarding so user can receive DMs |
| `/jemaw` | Same as the keyword "jemaw" — refresh pinned + kick scan |
| `/balance` | Replies in group with everyone's net position |
| `/settle` | Same as `/jemaw` but deep-links to Settle tab |
| `/add` | Opens Mini App on the manual-entry screen |
| `/history` | Opens Mini App on history tab |
| `/help` | Short message with the above |

**Keyword regex.** `/(?<![a-z0-9])jemaw(?![a-z0-9])/i`. Word-boundary, case-insensitive, no false positives on "jemawful" (not a word, but defensive).

**Rate limiting.** A given group can trigger a Gemini scan at most once per 60 seconds. Spamming "jemaw jemaw jemaw" updates the pinned message instantly but only kicks one scan.

---

## 11. Mini App — structure

**Routes (client-side):**
- `/` — Home (Suggestions inbox if any, otherwise Balances summary)
- `/suggestions` — Stack of pending suggestion cards
- `/suggestions/:id` — Detail / editor for one suggestion
- `/add` — Manual expense entry
- `/expense/:id` — View/edit an existing expense
- `/balances` — Per-member net position
- `/settle` — Settlement plan + mark-as-paid
- `/history` — Filterable list of all expenses + settlements
- `/settings` — Group settings (currency, members)

**Auth.** On launch, the Mini App reads `window.Telegram.WebApp.initData` and sends it with every API request. Server validates HMAC, resolves the Telegram user to a member in the calling group, and returns scoped data.

**State.** TanStack Query for server state, Zustand for the small bits of UI state that need to cross routes (e.g., the active filter on history).

**Real-time.** Server-Sent Events on `/api/groups/:id/stream` push: new suggestions appearing, balance changes, settlements marked paid. The Mini App shows them with motion (cards sliding in, numbers ticking).

---

## 12. Design system — Jemaw

### 12.1 Brand voice

Calm. Confident. Slightly dry. Never cute. Jemaw is the friend at the table who quietly remembers exactly who paid for what and doesn't make a big deal of it.

Microcopy examples:
- Empty state: "Nothing to track yet." — not "No expenses found! Add one now! 🎉"
- Confirmation: "Added." — not "Great job! Expense added successfully!"
- Settle-up zero state: "Everyone's even." — not "You're all settled up! 🥳"

### 12.2 Color tokens

**Mode philosophy.** Dark mode is default — Telegram's mobile experience leans dark and most users are in low-light contexts when they check group chats in the evening. Light mode is a respectful equivalent, not an afterthought.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0B0B0C` | `#FAFAF8` | Page background |
| `--surface` | `#141416` | `#FFFFFF` | Cards, sheets |
| `--surface-elevated` | `#1C1C20` | `#F2F2EF` | Modals, popovers |
| `--border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | Hairlines |
| `--border-strong` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.10)` | Active borders |
| `--text` | `#F5F5F4` | `#18181B` | Primary text |
| `--text-muted` | `rgba(245,245,244,0.60)` | `rgba(24,24,27,0.60)` | Secondary text |
| `--text-faint` | `rgba(245,245,244,0.36)` | `rgba(24,24,27,0.40)` | Tertiary text |
| `--accent` | `#34D399` | `#10B981` | Positive (credit), primary action |
| `--accent-soft` | `rgba(52,211,153,0.12)` | `rgba(16,185,129,0.10)` | Accent backgrounds |
| `--warn` | `#F59E0B` | `#D97706` | Pending suggestions, debt |
| `--warn-soft` | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.10)` | Warn backgrounds |
| `--danger` | `#EF4444` | `#DC2626` | Destructive |
| `--focus-ring` | `rgba(52,211,153,0.45)` | `rgba(16,185,129,0.40)` | Keyboard focus |

Accent is intentionally a single green. Not red-for-debt / green-for-credit — that pattern reads as anxious. Jemaw uses green for the primary brand action, amber for "this owes attention," and red strictly for destructive actions like void/delete.

### 12.3 Typography

**Family.** Inter Variable (`Inter`, weights 400/500/600). Display mode uses tighter tracking.

**Numerals.** All financial numbers use `font-variant-numeric: tabular-nums`. This is non-negotiable — column alignment depends on it and animated count-ups look broken without it.

**Scale.**

| Token | Size / Line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 40 / 44 | 600 | −0.02em | Big amounts on Settle / Balances |
| `title` | 28 / 32 | 600 | −0.015em | Screen titles |
| `heading` | 20 / 26 | 600 | −0.01em | Section headers |
| `body` | 16 / 22 | 400 | 0 | Default text |
| `body-strong` | 16 / 22 | 500 | 0 | Emphasized body |
| `label` | 14 / 18 | 500 | 0 | Labels, buttons |
| `caption` | 12 / 16 | 500 | 0.01em | Timestamps, metadata |
| `mono` | 14 / 18 | 500 | 0 | Currency codes, IDs |

### 12.4 Spacing

4px base. Use only these values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. The Tailwind config aligns to these.

### 12.5 Radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 8px | Pills, tags, small buttons |
| `--r-md` | 12px | Buttons, inputs |
| `--r-lg` | 16px | Cards |
| `--r-xl` | 24px | Sheets, modals |
| `--r-full` | 9999px | Avatars, circular icons |

### 12.6 Elevation

Jemaw avoids shadows. Surfaces separate via background lift and a 1px border. The only exception is the bottom sheet, which uses a soft top shadow when opened to suggest its origin off-screen.

| Token | Value |
|---|---|
| `--shadow-sheet` | `0 -8px 32px rgba(0,0,0,0.32)` (dark) / `0 -8px 32px rgba(0,0,0,0.08)` (light) |
| `--shadow-popover` | `0 4px 16px rgba(0,0,0,0.24)` (dark) / `0 4px 16px rgba(0,0,0,0.06)` (light) |

### 12.7 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 100ms | Tap feedback |
| `--dur-fast` | 180ms | Hover, focus |
| `--dur-base` | 240ms | Most transitions |
| `--dur-slow` | 360ms | Page-level transitions |
| `--dur-slower` | 500ms | Settle-up celebration |
| `--ease-standard` | `cubic-bezier(0.32, 0.72, 0, 1)` | Default for everything |
| `--ease-emphasized` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Slight overshoot for delight |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Outgoing transitions |
| `--spring-soft` | `{ stiffness: 280, damping: 30, mass: 1 }` | Layout transitions |
| `--spring-snap` | `{ stiffness: 420, damping: 32, mass: 0.8 }` | Tap responses |
| `--spring-bouncy` | `{ stiffness: 380, damping: 18, mass: 0.9 }` | Confirmation bursts |

### 12.8 Motion principles

**1. Animate to clarify, never to decorate.** Every animation must answer "what just happened" or "where did that come from." If you can't name the meaning, cut it.

**2. Origin-aware.** When a suggestion card expands to a detail view, it expands *from where it was tapped*. We use Framer Motion's `layoutId` to share state between the card and the detail page. Same for closing — the detail collapses back to its card position.

**3. Continuous, not punctuated.** No fade-then-slide-then-scale stacks. One smooth motion. If you find yourself chaining three keyframes, you're decorating.

**4. Reversible.** The exit animation is the reverse of the enter animation. A sheet that slides up exits by sliding down — not by fading.

**5. Skippable.** `prefers-reduced-motion: reduce` collapses all durations to ≤80ms and disables spring physics. Functional only, not visual.

**6. Tabular for numbers.** Any animated number uses tabular figures and changes per-digit (slot-machine style) over `--dur-base`. Never crossfade the whole number.

### 12.9 Signature micro-interactions

**Suggestion card tap.** Scale to 0.97 over `--dur-instant`, spring back. If confirmed, the card lifts 4px, accent border pulses once, then the card shrinks and slides into the balance summary at the top.

**Dismiss (swipe left).** Card follows the finger 1:1 with a slight rotation (max −6°). Past 40% of width or 800px/s velocity, it commits — exits left over 220ms with `--ease-exit`. Below threshold, springs back.

**Number change.** Each digit position is its own DOM element. When a balance changes, only the digits that differ animate; they slide vertically (old digit up and out, new digit up and in) over 200ms.

**Loading.** Skeleton shapes match the final card silhouette. A linear gradient sweep moves left-to-right over 1.2s, loops. No spinners anywhere in the app.

**Settle-up complete.** When the last "mark as paid" is tapped and the group reaches zero, the Balances screen pulses the accent color once across all rows, and the empty-state copy ("Everyone's even.") fades in with a 40ms stagger per character — the only place in the app where text animates.

**Pull-to-refresh.** On the suggestions tab, pulling triggers a re-scan. The pull pulls a single line ("Listening to the chat...") into view. On completion the line transitions to a count of new suggestions, then fades.

### 12.10 Component specs

**Button — primary**
- Background `--accent`, text `#0B0B0C`, radius `--r-md`, height 44, padding-x 20
- Hover: brightness 1.05; tap: scale 0.97 (`--spring-snap`)
- Disabled: 40% opacity, no pointer events

**Button — ghost**
- Background transparent, text `--text`, border 1px `--border-strong`
- Same dimensions/motion as primary

**Button — danger**
- Background transparent, text `--danger`, border 1px `--danger` at 40% opacity

**Button — icon**
- 40×40, radius `--r-full`, background transparent, hover: `--surface-elevated`

**Card — suggestion**
- Background `--surface`, border 1px `--border`, radius `--r-lg`, padding 16
- Confidence indicator: 4px-wide accent-soft strip on the left edge, full height
- Low-confidence variant: accent strip becomes warn-soft, "low confidence" caption shown
- Tappable; uses `layoutId="suggestion-{id}"` for shared transition to detail

**Card — expense (in history)**
- Same shape as suggestion but no left strip
- Payer avatar (24px) on left, description center, amount right
- Tap opens detail

**List item**
- Height 56 (or 64 if two-line), full-width, no border between (rely on internal padding)
- Hover: background lifts to `--surface-elevated`

**Avatar**
- Circle, 24/32/40 sizes
- Initial of display name on `--surface-elevated` background
- No images in v1

**Pill / tag**
- Height 24, padding-x 8, radius `--r-full`, caption type
- Variants: neutral (`--border`), accent (`--accent-soft`), warn (`--warn-soft`)

**Bottom sheet**
- Anchored to bottom, max-width 560 centered, max-height 92vh
- Radius `--r-xl` top corners only
- Enter: slide up + fade backdrop (240ms, `--ease-standard`)
- Exit: slide down + fade out (240ms, `--ease-exit`)
- Drag-to-dismiss with rubber-band past 30% of height

**Modal (centered)**
- Used only for destructive confirmations
- Max-width 360, padding 24, radius `--r-lg`
- Enter: scale from 0.96 + fade, 200ms

**Number input (amount)**
- Display-size text, tabular-nums, currency prefix in `--text-muted`
- Tap opens a 10-key custom keypad as a bottom sheet
- Avoids native keyboard which is slow and ugly for amounts

**Member selector**
- Horizontal scrolling row of avatar+name chips
- Tap toggles inclusion in the split
- Selected: accent border, accent-soft background

**Toast**
- Anchored top, full-width minus 16, height 48
- Auto-dismiss 3s
- Single-line with optional 1 action ("Undo")

---

## 13. Screen designs

### 13.1 Onboarding (group install)

After `/start` in a group, the bot posts a single message:

> **Jemaw is here.**
> I'll listen for the word "jemaw" and suggest expenses from your chat. To do that, I need to see your messages — tap below to walk through the 30-second setup.
> [Set me up]

Setup is three screens in the Mini App:
1. **Privacy mode check.** Detect via API. If still on, show step-by-step with BotFather screenshots. "Done" button re-checks.
2. **Members.** Auto-pulled from group. Confirm names; tap to rename anyone.
3. **Currency.** Pick one. Default to user's locale guess.

### 13.2 Home

Conditional: if there are pending suggestions, Home = Suggestions tab. Otherwise Home = Balances summary.

**Header.** Group name + member-count caption. Settings gear top right.

**Tab bar.** Bottom-anchored, 4 tabs: Suggestions (badge if >0), Balances, History, Add. Active tab gets accent-soft pill background under the icon+label.

### 13.3 Suggestions inbox

Vertical stack of cards. Each card:

```
┌─────────────────────────────────────────┐
│ ▌ Dinner at Trattoria del Sole          │
│ ▌ €52.00 · Sara paid · split 4 ways    │
│ ▌                                       │
│ ▌ "I got dinner, was around 50ish"     │
│ ▌ — Sara, 21:14                         │
│ ▌                                       │
│ ▌  [ Dismiss ]    [ Edit ]    [ ✓ Add ]│
└─────────────────────────────────────────┘
```

- Left accent strip indicates confidence (accent for high, warn for low)
- Quoted message is the evidence Gemini cited
- Swipe left to dismiss; tap card body to edit
- ✓ Add commits with current values

When all are resolved, the screen empties to: "Caught up." in `--text-muted`, centered, with a subtle "Re-scan" link below.

### 13.4 Expense detail / editor

Opened by tapping a suggestion or an existing expense. Slides in from the right (or via shared `layoutId` from the suggestion card).

Fields:
- Description (text)
- Amount (large display number, tabular)
- Currency (locked to group default in v1)
- Payer (avatar selector)
- Split type (segmented: Equal | Shares | Exact)
- Split with (member chip selector)
- For Shares: number stepper per member
- For Exact: amount input per member, with running total + remainder indicator

Footer: [Cancel] [Save] (or [Delete] [Save] when editing existing)

### 13.5 Balances

A list, one row per member, sorted by amount descending.

```
Sara         +€48.50    (owed)
You          +€12.00    (owed)
Tom           −€18.00   (owes)
Mia           −€42.50   (owes)
```

Positive numbers in `--accent`, negative in `--warn`. Tap a row to filter History to expenses involving that person.

### 13.6 Settle-up

Shows the minimum set of transfers. Algorithm: greedy match largest creditor with largest debtor until all are zero.

```
To zero everyone out:

Mia  →  Sara    €42.50    [Mark as paid]
Tom  →  Sara    €6.00     [Mark as paid]
Tom  →  You     €12.00    [Mark as paid]
```

Only the payer can mark a line as paid (`from_member_id == current user`). Tapping shows a confirmation sheet: "Did you send €42.50 to Sara? This only records it — no money moves through Jemaw." [Yes, mark paid] [Not yet].

When all are marked, balances zero out and the screen celebrates per 12.9.

### 13.7 History

Reverse-chronological list grouped by day. Two row types: expense (with payer avatar + amount) and settlement (with arrow icon between members).

Filter bar at top: All / Expenses / Settlements, and a member chip selector that intersects.

Tap any row to open detail. Long-press for quick actions (void, duplicate).

### 13.8 Settings

- Group name
- Currency (locked once expenses exist; show why)
- Members: add (sends a join invite to the group), remove (with balance-zero check), rename
- Notifications: per-user toggle for DM suggestions
- Advanced: re-scan window (default last 24h), confidence threshold (default 0.7)
- Danger zone: export to CSV, delete all data

---

## 14. Settle-up algorithm

Standard minimum-transactions greedy:

```
1. Compute net balance per member from expenses and prior settlements.
2. Separate into creditors (>0) and debtors (<0).
3. While both lists non-empty:
   a. Take largest creditor C and largest debtor D.
   b. Transfer = min(C.amount, |D.amount|).
   c. Emit settlement: D → C, transfer.
   d. Adjust balances; remove any that hit 0.
4. Return the list of settlements.
```

This isn't proof-optimal (the general problem is NP-hard), but for groups under ~12 people it produces the minimum or near-minimum every time and is O(n log n).

Edge cases:
- Floating-point rounding: amounts stored as integer cents, divided at display time.
- Uneven equal-split (€10 / 3): one share gets the remainder cent. The "remainder bearer" rotates by expense ID hash so it's fair over time.

---

## 15. Security & privacy

**Authentication.** Every Mini App request includes Telegram `initData`. Server verifies the HMAC-SHA256 of the data string against `bot_token`. Reject if invalid or older than 24 hours.

**Authorization.** A Telegram user can only read/write data for groups they're an active member of. Membership is verified against the `members` table; on every request we re-confirm the user is still in the Telegram chat at low frequency (cached 5 min).

**Privacy-mode warning.** If the bot is in a group with privacy mode on, it cannot read messages — Gemini scans will return nothing useful. The onboarding flow refuses to complete until privacy mode is off (or bot is admin).

**Message retention.** `messages` table rolls 30 days. Group admins can delete all stored messages immediately from Settings → Danger zone.

**AI data handling.** Messages sent to Gemini contain text + display names. No phone numbers, no @-usernames passed to the model. The Gemini API request is made server-side; users' Telegram IDs are not sent.

**Secrets.** Bot token, Gemini API key, DB URL, HMAC secret in env vars. Rotated by changing env and redeploying.

**Logging.** No message bodies in logs. Sentry breadcrumbs strip `text` fields.

---

## 16. Development roadmap

**Phase 0 — Foundations (3 days)**
Repos: `jemaw-bot` (Node/TS), `jemaw-app` (Vite/React/TS). Postgres provisioned on Neon. Drizzle schema for all tables. Fly + Vercel deploy pipelines green. Webhook URL registered with @BotFather. `/start` and `/help` reply with placeholder text.

**Phase 1 — Bot + manual ledger (4 days)**
Group onboarding flow. Member sync. Pinned-message manager. Mini App boots with `initData` auth. Manual expense entry end-to-end. Balances tab live. History tab live. No AI yet.

**Phase 2 — Settle-up + polish on core (4 days)**
Settle-up algorithm + screen. Mark-as-paid flow. Settlement records. Edit/void on expenses. Empty states and error states on every screen. First pass of motion (no Framer Motion yet — just CSS transitions).

**Phase 3 — Gemini trigger loop (3 days)**
Keyword regex + scan queue + Gemini call + JSON validation. Suggestions table + suggestions tab in the Mini App. Confirmation/edit/dismiss flows. Per-user DM dispatcher. Pinned message reflects suggestion count.

**Phase 4 — Motion & finish (3 days)**
Framer Motion across the app per section 12. Shared `layoutId` transitions. Number animations. Skeleton loaders. Reduced-motion fallback. Final pass on copy and microcopy.

**Phase 5 — Beta with your group (ongoing)**
Install in the real group. Daily check on suggestions quality. Tune confidence threshold + prompt. Collect feedback. Ship fixes weekly.

Total to v1.0: roughly 17 working days for one developer, comfortable on evenings/weekends in about 5–6 weeks.

---

## 17. Cost estimate

| Item | Monthly |
|---|---|
| Fly.io (bot service) | $3 |
| Vercel (Mini App) | $0 (Hobby) |
| Neon Postgres | $0 (free tier, < 0.5GB) |
| Upstash Redis | $0 (free tier) |
| Gemini API | < $5 (scales with usage) |
| Sentry | $0 (free tier) |
| Domain (optional) | $1 amortized |
| **Total** | **< $10/mo** |

---

## 18. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Group forgets to disable privacy mode | Onboarding hard-gates; bot detects and re-prompts |
| Gemini hallucinates expenses | Every suggestion needs evidence message IDs; confidence threshold; always confirm |
| "jemaw" mentioned out of context | Scan window is bounded; suggestions still go through confirmation |
| Member leaves group with non-zero balance | Settings flow blocks removal until balance is zero or marked written-off |
| Group abandons app mid-trip | Re-engagement DM after 7 days of silence with pending suggestions |
| Telegram changes Mini App API | grammY tracks API closely; allow 1 week of buffer per release |
| Token leak | Single rotation script; tokens in env only; no client-side secrets |

---

## 19. Future — v2 and beyond

- **OCR receipt photos.** Tap "+" → photo → Gemini Vision extracts amount and items.
- **Recurring expenses.** Monthly rent split, weekly groceries.
- **Categories + budgets.** Optional, opt-in.
- **Multi-currency per group.** Useful for travel; needs FX rate handling.
- **Splitwise import/export.** Lower the switching cost.
- **Web dashboard.** For people who actually want a desktop view.
- **Group templates.** "Vacation," "Roommates," "Office lunch crew" — preset configs.
- **Notification on big balances.** Optional DM when you cross a threshold.

---

## 20. Definition of done — v1.0

Jemaw v1.0 ships when:

1. A new group can install and onboard the bot in under 2 minutes.
2. Typing "jemaw" in a real conversation surfaces at least one correct suggestion within 5 seconds, 80% of the time, in a 50-message window with multiple expense events.
3. Every screen has a tested empty state, loading state, and error state.
4. The Mini App renders correctly on iOS Telegram, Android Telegram, and Telegram Desktop.
5. `prefers-reduced-motion` is respected throughout.
6. A full session (open → review 5 suggestions → settle up → mark paid) completes in under 30 seconds for an experienced user.
7. P95 API latency under 300ms for non-AI endpoints, under 3s for AI endpoints.
8. No PII in logs. HMAC validated on every request. Privacy-mode check enforced.
9. Costs hold under $10/mo for a single active group with daily use.
10. You and your group use it on a real trip and don't reach for a calculator once.
