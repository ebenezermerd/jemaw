# Jemaw interactive humor research brief

**Audience:** product research, design, and engineering  
**Purpose:** give researchers a complete, accurate picture of the current product, data, AI, and infrastructure so they can produce implementation ready findings for a new feature: an interactive bot that uses humor, including humor that reflects the group itself.  
**Date:** 2026-07-17  
**Status:** research input (not a design decision log)

---

## 1. How to use this document

Researchers should:

1. Read sections 2 through 7 as **facts about the current system** (as of this date).
2. Treat section 8 as the **feature goal** under research (not yet built).
3. Answer the questions in section 9 with evidence (user interviews, chat samples, competitor notes, safety review).
4. Deliver section 10 outputs (findings pack) so engineering can implement without re-deriving context.

Related source of truth in the repo:

| Topic | Location |
| --- | --- |
| Product vision and brand voice | `JEMAW_PLAN.md` |
| Schema | `packages/shared/src/schema.ts` |
| AI scan pipeline | `packages/bot/src/ai/*` |
| Bot triggers and chat behaviour | `packages/bot/src/bot.ts` |
| REST API for Mini App | `packages/bot/src/api/routes.ts` |
| AWS deploy | `docs/DEPLOY_AWS.md`, `infra/aws/*` |
| AI secrets helper | `scripts/aws-set-ai-keys.sh` |
| Phase 3 scan design | `docs/superpowers/specs/2026-06-01-jemaw-phase-3-gemini-design.md` |
| Group state summary for AI | `docs/superpowers/specs/2026-06-09-ai-group-state-summary-design.md` |

Note: root `README.md` still mentions older hosting (Cloud Run + Firebase) and an older Gemini model name. Prefer this brief and `docs/DEPLOY_AWS.md` for production topology.

---

## 2. Product overview

### 2.1 What Jemaw is

Jemaw is a **Telegram native expense companion** for friend groups. People talk about money in the group chat. Jemaw:

1. Captures recent group messages.
2. Runs an AI **scan** that drafts structured expense, loan, and settlement suggestions.
3. Shows those drafts in a **Telegram Mini App**.
4. Lets members confirm, edit, or dismiss.
5. Tracks balances and settle up **off platform** (no money moves through Jemaw).

Positioning from `JEMAW_PLAN.md`: the quiet bookkeeper inside the chat, not a separate spreadsheet app.

### 2.2 Core user loop today

```text
Group chat mentions money
        |
        v
Trigger: "jemaw" keyword, /jemaw, or Mini App open / pull to refresh
        |
        v
Bot scan (AI extract JSON)  -->  suggestions rows in Postgres
        |
        v
Mini App Home / Suggestions  -->  confirm / edit / dismiss
        |
        v
Ledger (expenses, shares, settlements)  -->  settle plan
```

### 2.3 Packages (monorepo)

```text
packages/
  shared/   # Drizzle schema, shared types
  bot/      # grammY bot + Fastify API + domain + AI scan
  app/      # Vite React Mini App (Telegram WebApp)
  admin/    # Admin console (Firebase Auth oriented; secondary)
```

Tooling: TypeScript, pnpm workspaces, Vitest, Drizzle ORM.

### 2.4 What exists vs what does not (interaction)

| Exists today | Does not exist today |
| --- | --- |
| AI extraction of expenses / loans / settlements | Freeform conversational chatbot |
| Mini App confirm UX | Public group banter after every message |
| Pinned "Open Jemaw" button with suggestion count | Group adaptive humor engine |
| Optional 👀 reactions on evidence messages | Persistent "group vibe" profile |
| Weekly digest job | Per user private review DMs (planned in product doc, not the interactive humor system) |
| Strict JSON scan output | LLM written witty replies as a product surface |
| Brand voice guidance (calm, dry, never cute) | Shipped interactive humor feature |

**Critical implication:** the current AI is an **extractor**, not a **conversational personality**. Humor and interactivity are a new layer.

---

## 3. Data we store

All application data lives in **Postgres** (production: AWS RDS). Schema is defined in `packages/shared/src/schema.ts`.

### 3.1 Tables (summary)

| Table | Purpose | Notable fields |
| --- | --- | --- |
| `groups` | One Telegram group chat | `telegram_chat_id`, `name`, `default_currency`, `last_scan_message_id`, `pinned_message_id`, `settings` (jsonb) |
| `members` | People in a group | `telegram_user_id`, `display_name`, `username`, `role` (admin/member), `is_active`, `is_primary` |
| `messages` | Captured group text for scans | `telegram_message_id`, `sender_telegram_user_id`, `text`, `sent_at` (unique per group + message id) |
| `ai_runs` | One row per scan attempt | trigger type, message window, tokens, duration, status, `raw_response` |
| `suggestions` | AI drafts pending human review | kind, confidence, description, amount, payer/parties, split, evidence message ids, reasoning, status |
| `expenses` | Confirmed ledger expenses / loans | amount, currency, description, payer, source, `occurred_at`, void support |
| `expense_shares` | Per member share of an expense | `share_amount` |
| `settlements` | Recorded paybacks | from/to, amount, method, optional `expense_ids` |
| `settlement_allocations` | How a settlement covers specific expenses | settlement + expense + debtor + allocated amount |

### 3.2 Enums that matter for AI and UX

- **Suggestion kind:** `expense` | `loan` | `settlement`
- **Suggestion status:** `pending` | `confirmed` | `edited` | `dismissed`
- **AI trigger:** `keyword` | `command` | `manual` (Mini App)
- **AI run status:** `success` | `parse_error` | `api_error`
- **Expense source:** `manual` | `ai_confirmed` | `ai_edited`
- **Split type:** `equal` | `shares` | `exact`
- **Member role:** `admin` | `member`

### 3.3 What goes into AI context today

From `packages/bot/src/ai/scan.ts` and `prompt.ts`, a scan builds:

1. Group currency  
2. Members (display name + prompt scoped id)  
3. Open debts summary (from group state summary)  
4. Recent settlements summary  
5. Recent confirmed expenses summary (avoid re suggesting)  
6. Last **N messages** (currently **N = 10** in code) with sender display name, clock time (HH:MM), and full text  

Privacy choices already encoded:

- Prompt uses **display names**, not phone numbers.
- Telegram user ids appear only as structured ids for payer/split references.
- Plan forbids inventing amounts; every suggestion needs `evidence_message_ids`.

### 3.4 What we do **not** store today (relevant to the new feature)

| Missing for humor / interactivity | Implication |
| --- | --- |
| Group vibe / tone profile | No durable "how this group jokes" model |
| Interactive reply history | Cannot avoid repeating jokes or measure reaction |
| Per group humor settings | No off / dry / match group toggle |
| Structured expense dates from chat list lines | AI suggestions have no date field; confirm uses `occurredAt: now` |
| Freeform bot dialogue turns | No chat transcript of bot personality |
| Explicit consent flag for "learn our humor" | Would need product decision + storage |

### 3.5 `groups.settings` jsonb

Already used for flexible group config (including AI group state summary stamps). New feature flags or vibe profiles **can** start here without a migration, or as dedicated tables if research recommends durability and queryability.

---

## 4. Current AI structure

### 4.1 Role of AI in the product

AI is used to:

1. **Extract** money events from recent chat into validated JSON.  
2. Support **weekly digest narrative** generation (separate path in bot).  
3. Power group state **summary** content used as scan context.

AI is **not** used today to hold a multi turn conversation with the group.

### 4.2 Runtime architecture

```text
                    +------------------+
  Telegram webhook  |  packages/bot    |
  Mini App /scan -->|  Fastify + bot   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     scanGroup()                      other bot jobs
              |                       (pin, digest, ...)
              v
     ScanClient.suggest(system, user)
              |
     +--------+---------+
     |                  |
  Groq primary     Gemini fallback
  (if key set)     (if key set)
     |                  |
     +--------+---------+
              |
              v
     scanResponseSchema (zod)
              |
              v
     filter confidence, map members, dedupe evidence
              |
              v
     suggestions + ai_runs in Postgres
```

Key files:

| File | Role |
| --- | --- |
| `packages/bot/src/index.ts` | Wires Groq + Gemini clients, rate limiter, server |
| `packages/bot/src/ai/geminiClient.ts` | `ScanClient` interface; Groq OpenAI compatible client; Gemini client; `withFallback` |
| `packages/bot/src/ai/prompt.ts` | System + user prompt for extraction only |
| `packages/bot/src/ai/scanSchema.ts` | Zod schema + confidence tiers |
| `packages/bot/src/ai/scan.ts` | Orchestrates one scan |
| `packages/bot/src/ai/summary.ts` | Group state summary for context |
| `packages/bot/src/ai/rateLimit.ts` | Per group scan rate limit |
| `packages/bot/src/bot.ts` | Keyword / command triggers; badges evidence |

### 4.3 Models and provider configuration (production)

Observed live ECS task definition `jemaw-prod-bot` revision **4** (eu-north-1):

| Setting | Value |
| --- | --- |
| Primary provider | **Groq** when `GROQ_API_KEY` is present |
| Primary model | **`llama-3.3-70b-versatile`** via env `GROQ_MODEL` |
| Fallback provider | **Google Gemini** when `GEMINI_API_KEY` is present |
| Fallback model | **`gemini-2.0-flash`** (hardcoded in `createGeminiClient`) |
| Boot log when both keys present | `[scan] using Groq (Gemini fallback)` |
| Temperature | 0 for both (stable extraction) |
| Response mode | JSON object / `application/json` |

Secrets (AWS Secrets Manager, never in git):

- `jemaw-prod/groq-api-key`
- `jemaw-prod/gemini-api-key`
- `jemaw-prod/telegram-bot-token`
- `jemaw-prod/database-url`

Injected into the container as env via ECS secrets: `GROQ_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`.

Operator helper: `./scripts/aws-set-ai-keys.sh` (writes Secrets Manager + rewires task definition). Do not put AI keys in `terraform.tfvars` or tracked files.

### 4.4 Scan triggers

| Trigger | Type stored in `ai_runs` | Where |
| --- | --- | --- |
| Keyword regex on plain text (jemaw) | `keyword` | group message handler |
| `/jemaw` command | `command` | bot commands |
| Mini App POST `/api/groups/:id/scan` | `manual` | pull to refresh / auto scan when `canScan` |

Rate limit: per group gate (`ScanRateLimiter`); spam of keyword does not spam model calls.

### 4.5 Output contract (extraction)

Suggestions (expense/loan) include roughly:

- `kind`, `confidence`, `description`, `amount`, `currency`
- `payer_telegram_id` (nullable)
- `split_type`, `split_with`, `shares`
- `evidence_message_ids`, `reasoning`

Settlements include parties, optional amount, evidence, reasoning.

Confidence tiers (`scanSchema.ts`):

- `>= 0.7` normal card  
- `0.5` to `< 0.7` low confidence card  
- `< 0.5` dropped  

Post processing:

- Drop unknown members  
- Default empty split to **primary** members  
- Deduplicate if evidence message ids already used by any existing suggestion in the group  
- Within **one** scan, multiple suggestions may share the same evidence message id (e.g. multi line expense list in one Telegram message)

### 4.6 Multi line expense lists (current behaviour)

If someone posts one message with many lines (dates + amounts + labels):

- The **pipeline allows** multiple suggestions from that one message.
- There is **no hard rule** "one suggestion per line" in the prompt.
- There is **no structured date field** on suggestions; confirm sets `occurredAt` to **now** unless the user edits a date.
- Dates in the text may appear only in description/reasoning if the model chooses.

Researchers should not assume perfect per line dating without a product change.

### 4.7 Brand voice already specified

From `JEMAW_PLAN.md` (paraphrased for research):

- Calm, confident, slightly dry  
- **Never cute**  
- Quiet bookkeeper energy  

Any humor feature must reconcile with this, or research must explicitly recommend updating brand language.

---

## 5. Application surfaces and configuration

### 5.1 Telegram bot

- Bot username (prod config): `jemawsbot`  
- Mini App short name: `app`  
- Mode: **webhook**  
- Webhook URL (prod): `https://d89n7vsaqyf8q.cloudfront.net/telegram/webhook`  
- Group privacy: must be able to read group messages for scans (BotFather privacy mode off or bot admin)  
- Chat behaviour today: mostly **quiet**; pin button; help/start text; weekly digest; evidence reactions  

### 5.2 Mini App (`packages/app`)

- React SPA opened inside Telegram  
- Auth: Telegram `initData` validated by bot API  
- Main routes include Home, Suggestions, history/settle flows  
- API base URL is baked at build time (`VITE_API_BASE_URL`)  
- Prod Mini App CDN (from live task env): `https://d2e3ak7qtvr44j.cloudfront.net`  
- Prod API CDN: `https://d89n7vsaqyf8q.cloudfront.net`  

Home and Suggestions can trigger scans on refresh when the group is scannable (`canScan` requires AI keys configured on the server).

### 5.3 Bot / API process env (contract)

Validated in `packages/bot/src/env.ts` (selected):

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `TELEGRAM_BOT_TOKEN` | Bot auth |
| `BOT_MODE` | `polling` or `webhook` |
| `WEBHOOK_URL` | Required when webhook registration enabled |
| `REGISTER_TELEGRAM_WEBHOOK` | Often `false` in AWS (webhook set by script) |
| `MINI_APP_URL` | CORS + deep links |
| `CORS_EXTRA_ORIGINS` | Legacy hosts (e.g. old Firebase) |
| `BOT_USERNAME`, `MINI_APP_SHORT_NAME` | Deep links |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL` | AI |

---

## 6. Infrastructure (production)

### 6.1 High level topology (AWS)

Region: **`eu-north-1`** (Stockholm). Stack under Terraform/OpenTofu in `infra/aws/`.

```text
Telegram
   |
   | webhook
   v
CloudFront (bot API)  -->  ALB  -->  ECS Fargate service jemaw-prod-bot
                                      |
                                      | secrets
                                      v
                               Secrets Manager
                                      |
                                      v
                                    RDS Postgres

Telegram Mini App client
   |
   v
CloudFront (app)  -->  S3 private bucket (static SPA)
   |
   | HTTPS API calls
   v
CloudFront (bot API) as above
```

### 6.2 Components

| Component | Name / notes |
| --- | --- |
| ECS cluster / service | `jemaw-prod-bot` |
| Task definition | family `jemaw-prod-bot` (live rev observed: 4) |
| Task size | 256 CPU, 512 MB |
| Container image | ECR `jemaw-prod-bot:latest` |
| Logs | CloudWatch `/ecs/jemaw-prod-bot` |
| RDS | Postgres 16, app DB name typically `jemaw` |
| Secrets | `jemaw-prod/*` as listed above |
| App hosting | S3 + CloudFront |
| Legacy GCP / Firebase | Project `jemaw-498106` historically used; has been suspended / not the AI host. CORS still allows old Firebase origin as extra. |

### 6.3 Deploy paths

| Change | How |
| --- | --- |
| Bot code image | `./scripts/aws-deploy-bot.sh` (build/push ECR, force ECS deploy) |
| Mini App static | `./scripts/aws-deploy-app.sh` |
| Telegram webhook | `./scripts/aws-set-telegram-webhook.sh` |
| AI keys only | `./scripts/aws-set-ai-keys.sh` (Secrets Manager + task secrets) |
| Infra | OpenTofu/Terraform under `infra/aws` |

### 6.4 Health check

`GET https://d89n7vsaqyf8q.cloudfront.net/health` → `{"ok":true,"service":"jemaw-bot"}`

### 6.5 Cost and ops notes for research

- Scan cost is currently one (or two on fallback) LLM call per allowed scan.  
- Interactive humor that adds another LLM call multiplies cost and latency.  
- Rate limits and group mute settings are essential if the bot starts talking in public chats.

---

## 7. Current configuration snapshot (ops checklist)

Use this as a baseline when designing the new feature.

| Item | Current prod posture |
| --- | --- |
| AI primary | Groq `llama-3.3-70b-versatile` |
| AI fallback | Gemini `2.0-flash` |
| Scan window | Last 10 messages |
| Scan output | Strict JSON suggestions + settlements |
| Human gate | Confirm/edit/dismiss in Mini App |
| Group chat noise | Low by design |
| Brand | Dry bookkeeper, not cute |
| Secrets | AWS Secrets Manager |
| Hosting | AWS only for live bot + app CDN |
| Feature flags for humor | None |

---

## 8. New feature goal (under research)

### 8.1 Problem

Jemaw is useful but can feel silent or mechanical. Groups already have their own humor and social energy in chat. We want the bot to feel **present and interactive**, using humor that:

1. Fits Jemaw (trustworthy with money).  
2. Reflects **the group’s own humor**, not only a generic brand joke pack.

### 8.2 Desired outcomes

- Members notice Jemaw as a participant in the social fabric of the trip/group, not only as a form backend.  
- After scans and key moments, short interactive feedback increases Mini App opens and confirms.  
- Humor never reduces trust in balances or invents financial facts.  
- Groups can tone down or turn off personality.

### 8.3 Feature pillars to research

| Pillar | Description |
| --- | --- |
| **Interactive** | Bot speaks or reacts at defined moments (not continuous chatter unless research proves otherwise) |
| **Jemaw humor** | Dry, calm personality consistent with brand |
| **Group adaptive humor** | Tone, language mix, roast level, and callbacks inspired by how *this group* already talks |
| **Money safe** | Personality layer cannot change ledger math or invent amounts |

### 8.4 Non goals (unless research overturns them with strong evidence)

- Replacing the Mini App with pure chat based expense entry  
- Unrestricted roasting of individual members  
- Merging humor instructions into the extraction prompt in a way that worsens JSON quality  
- Scraping content outside the group chat Jemaw already serves  

### 8.5 Working product principle

**Bookkeeper first, humor second.**  
If a line would be funny but untrue about money, it must not ship.

---

## 9. Research questions (must answer)

### 9.1 Product and UX

1. Where should interactive lines appear: group chat, DM only, Mini App copy, or a mix?  
2. Which events deserve a bot line (scan success, zero findings, confirm, settle, weekly digest, freeform address)?  
3. What maximum frequency avoids annoyance (per hour / per day / per scan)?  
4. Should default be "match group" or "Jemaw dry only"?  
5. How do multilingual groups (e.g. English + Amharic) want language handled?  
6. Is public callback to in jokes acceptable, or only private DM?

### 9.2 Group humor modeling

1. Which signals best predict group humor (emoji density, message length, slang, roast patterns, languages)?  
2. How many recent messages are enough to infer vibe without feeling invasive?  
3. Should vibe be recomputed each time or stored as a profile?  
4. Who can reset or edit vibe (any member vs admin)?  
5. What is explicitly banned even if the group does it (identity attacks, debt shaming one person, etc.)?

### 9.3 Model and architecture

1. Template only MVP vs generative one liners vs hybrid?  
2. Same model as extraction or a separate reply model/call?  
3. How to hard separate **extract JSON** from **persona text**?  
4. What fact packet must ground every reply (suggestion count, real balances only, no invented numbers)?  
5. Latency budget for a post scan reply in Telegram?

### 9.4 Safety, privacy, trust

1. Consent model for learning group humor?  
2. Data retention for vibe profiles and reply logs?  
3. Red team cases: cruel roast, wrong amount in a joke, political content, harassment?  
4. How does this interact with Telegram privacy mode and DM `/start` requirements?

### 9.5 Success metrics

Define targets for experiments:

- Scan → Mini App open rate  
- Suggestion confirm rate  
- Dismiss rate and "mute bot" rate  
- Qualitative "sounds like us" score  
- Extra LLM cost per active group per week  
- Support complaints about noise  

---

## 10. What we need to make the feature functional

This is the engineering and product checklist researchers should validate and prioritize.

### 10.1 Product artifacts (required before broad build)

| Artifact | Purpose |
| --- | --- |
| Interaction map | Surfaces, triggers, max frequency |
| Voice and group humor rules | Allowed / banned patterns with examples |
| Settings model | Off / Jemaw dry / match group (+ admin controls) |
| MVP scope | Smallest shippable interactive slice |
| Measurement plan | Metrics and experiment design |

### 10.2 Technical building blocks (likely)

| Building block | Why needed |
| --- | --- |
| **Reply / persona pipeline** separate from `scanGroup` | Keep extraction accuracy |
| **Fact packet builder** | Only true scan/ledger facts enter joke copy |
| **Style sampler or vibe profile** | Group adaptive humor needs input features |
| **Policy engine** | Rate limits, mute, channel (group vs DM) |
| **Composer** | Templates and/or LLM generation with max length |
| **Delivery** | Telegram sendMessage / reply / DM / Mini App strings |
| **Persistence** | Optional `group_vibe`, `bot_replies` or settings keys + logs |
| **Feature flag** | Gradual rollout per group |
| **Eval harness** | Golden chats: expected tone, never invent amounts |
| **Observability** | CloudWatch + structured logs for reply failures |

### 10.3 Data additions to consider (research should confirm shape)

Examples only (not decided):

```text
groups.settings.humor = {
  mode: "off" | "jemaw_dry" | "match_group",
  max_public_replies_per_day: number,
  language_preference: "auto" | "en" | ...
}

groups.settings.vibe = {
  tone: "dry" | "warm" | "chaotic",
  roast_level: "low" | "medium",
  languages: string[],
  updated_at: iso,
  source_message_window: number
}

bot_replies (optional table)
  id, group_id, trigger_event, channel, text, model, fact_packet, created_at, feedback
```

### 10.4 Model configuration options to evaluate

| Option | Fit |
| --- | --- |
| A. Templates only | Lowest risk MVP, no extra LLM cost |
| B. Second call to Groq/Gemini after scan | Flexible group adaptive lines |
| C. Smaller/faster model for banter | Cost control |
| D. Same extraction model with dual prompts | Operationally simple but higher risk of mode bleed |

Research should recommend A/B/C/D with cost and quality evidence.

### 10.5 Explicit non coupling rule for implementation

Do **not** instruct the extraction system prompt to "be funny" as the main mechanism.  
Humor belongs in a **second stage** that consumes:

1. Validated scan results and/or ledger facts  
2. Style signals from recent messages  
3. Group settings  

Extraction remains strict JSON, temperature 0, schema validated.

### 10.6 Dependencies already available

- Message capture and last N message read APIs  
- Members and display names  
- Scan results and suggestion counts  
- Group summary / open debts  
- Groq + Gemini keys and fallback wiring  
- AWS bot deploy path  
- Mini App for deeper review  

### 10.7 Dependencies missing today

- Interactive reply product behaviour  
- Group vibe learning  
- Humor settings UX  
- DM dispatcher maturity for personality (if DM channel chosen)  
- Safety review process for generative jokes  
- Eval set of real group chats (with consent)

---

## 11. Suggested research methods

1. **Chat corpus review** (consented samples): quiet couples, loud friend groups, multilingual trips.  
2. **Wizard of Oz prototypes**: human written "bot lines" after real scans; measure delight vs cringe.  
3. **A/B concept test**: silence vs one dry line vs group matched line.  
4. **Safety red team**: adversarial prompts and cruel group norms.  
5. **Cost model**: extra tokens per scan reply at current Groq/Gemini pricing.  
6. **Technical spike** (optional, small): prototype reply composer behind a feature flag in a staging group only.

---

## 12. Required research deliverable (findings pack)

Researchers should return a single findings document that includes:

1. **Executive recommendation** (1 short paragraph): ship or not, and MVP shape.  
2. **Interaction policy**: when/where/how often the bot may speak.  
3. **Humor policy**: Jemaw voice + group adaptive rules + ban list.  
4. **Architecture recommendation**: template vs LLM, one vs two calls, data to store.  
5. **Schema/settings proposal**: concrete fields.  
6. **Safety and privacy requirements**.  
7. **Metrics and experiment plan**.  
8. **Phased implementation backlog** (MVP → v2 → v3) mapped to existing packages (`bot`, `app`, `shared`).  
9. **Open risks** and what would block launch.  
10. **Example replies** for at least three group archetypes and three events (scan hit, scan miss, settle).

Engineering will use that pack to write a design spec and implement behind a flag.

---

## 13. Appendix A: important code paths

| Concern | Path |
| --- | --- |
| Boot + AI client wiring | `packages/bot/src/index.ts` |
| Env validation | `packages/bot/src/env.ts` |
| Keyword/command scan trigger | `packages/bot/src/bot.ts` |
| Scan orchestration | `packages/bot/src/ai/scan.ts` |
| Prompt | `packages/bot/src/ai/prompt.ts` |
| Schema + confidence | `packages/bot/src/ai/scanSchema.ts` |
| Providers | `packages/bot/src/ai/geminiClient.ts` |
| Message capture | `packages/bot/src/repo.ts` (`captureMessage`, `lastNMessages`) |
| Manual scan API | `packages/bot/src/api/routes.ts` (`POST .../scan`) |
| Confirm suggestion (sets occurredAt now) | `packages/bot/src/api/routes.ts` confirm handler |
| Mini App auto scan | `packages/app/src/App.tsx`, `packages/app/src/lib/hooks.ts` |
| AWS infra | `infra/aws/main.tf` |
| AI key ops | `scripts/aws-set-ai-keys.sh` |

---

## 14. Appendix B: live production endpoints (non secret)

| Endpoint | Role |
| --- | --- |
| `https://d89n7vsaqyf8q.cloudfront.net/health` | Bot health |
| `https://d89n7vsaqyf8q.cloudfront.net/telegram/webhook` | Telegram webhook |
| `https://d2e3ak7qtvr44j.cloudfront.net` | Mini App (CloudFront) |

Secrets and tokens are not listed in this document. Rotate via AWS Secrets Manager and BotFather as needed.

---

## 15. Appendix C: one page summary for stakeholders

**Today:** Jemaw on AWS extracts expenses from group chat with Groq (Llama 3.3 70B) and Gemini Flash fallback, stores structured data in Postgres, and confirms via Mini App. The bot is intentionally quiet.

**Data:** groups, members, messages, AI runs, suggestions, expenses, shares, settlements, allocations.

**Gap:** no interactive personality and no model of the group’s own humor.

**Goal:** add a money safe interactive layer that can be dry like Jemaw and adaptive to each group’s humor.

**Need:** research backed policy + separate reply pipeline + optional vibe data + settings + metrics; do not overload the extraction prompt.

**Next:** complete the findings pack in section 12, then implement MVP behind a feature flag.
