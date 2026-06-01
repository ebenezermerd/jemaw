# Phase 5 — Beta Runbook

Phase 5 is not a code feature; it's the operational process of running Jemaw
with a real group and tuning it (JEMAW_PLAN.md §16, "ongoing"). This runbook is
the checklist for doing that.

---

## 0. Pre-flight (one time, in @BotFather)

- [ ] `/setprivacy` → **Disable** for `@jemawsbot` (so the bot can read group
      messages — scans find nothing otherwise).
- [ ] `/setmenubutton` → URL `https://jemaw-498106.web.app`.
- [ ] Add `@jemawsbot` to the real group; send `/start`.
- [ ] Confirm the pinned "Open Jemaw" message appears.
- [ ] Rotate the bot token + Gemini key (both were shared in chat):
      `printf '%s' "<new-bot-token>" | gcloud secrets versions add jemaw-bot-token --data-file=- --project=jemaw-498106`
      `printf '%s' "<new-gemini-key>" | gcloud secrets versions add jemaw-gemini-key --data-file=- --project=jemaw-498106`
      then redeploy: `gcloud run services update jemaw-bot --region=europe-west1 --project=jemaw-498106 --image=europe-west1-docker.pkg.dev/jemaw-498106/jemaw/jemaw-bot:latest`

---

## 1. First real scan (the smoke test that matters)

Tests use a mocked Gemini; this is the first real model call.

- [ ] Chat normally in the group about a couple of real expenses.
- [ ] Type **"jemaw"**.
- [ ] Open the Mini App → Suggestions tab.
- [ ] Expect ≥1 correct suggestion within ~5s (DoD §20.2).
- [ ] Tap a suggestion's evidence — does the cited message justify it?

If nothing appears, check, in order:
1. Privacy mode actually off (`getMe` → `can_read_all_group_messages: true`).
2. Messages are being captured (Cloud SQL `messages` table has rows).
3. `ai_runs` has a row; its `status` (success / parse_error / api_error).

---

## 2. Daily quality check (the core of the beta)

Look at the last day's scans:

```bash
# Through the proxy (see docs/HANDLER.md), or psql via docker:
SELECT status, count(*) FROM ai_runs WHERE created_at > now() - interval '1 day'
GROUP BY status;

SELECT confidence, status FROM suggestions
WHERE created_at > now() - interval '1 day' ORDER BY confidence DESC;
```

Track, informally:
- **Precision**: of surfaced suggestions, how many were real? (confirmed vs dismissed)
- **Recall**: real expenses the scan missed entirely.
- **Payer accuracy**: did it pick the right payer?
- **api_error / parse_error rate**: should be near zero.

---

## 3. Tuning levers (no redeploy needed for prompt-only changes? — see note)

- **Confidence threshold** — currently surfaces ≥0.5 (low) / ≥0.7 (normal),
  drops <0.5 in `packages/bot/src/ai/scanSchema.ts`. Raise `CONFIDENCE_LOW` if
  too many junk suggestions; lower if it's missing real ones.
- **Prompt** — `packages/bot/src/ai/prompt.ts` (`SYSTEM_PROMPT` + user prompt).
  Tighten instructions for failure patterns you observe (e.g. "ignore amounts
  said as plans/jokes").
- **Scan window** — `MAX_MESSAGES` in `packages/bot/src/ai/scan.ts` (default 50).
- **Rate limit** — `SCAN_WINDOW_MS` in `packages/bot/src/ai/rateLimit.ts` (60s).

> All four are code constants today, so a change = commit → CI → rebuild image →
> `gcloud run services update`. A future enhancement (Settings §13.8) would make
> threshold + window live-tunable per group without a redeploy; not built in v1.

Each tuning change: branch → PR → CI green → merge → redeploy. Keep changes
small and note what problem each addresses.

---

## 4. Weekly

- [ ] Review the week's confirm/dismiss ratio; decide one prompt/threshold tweak.
- [ ] Skim `ai_runs.raw_response` for a few dismissed suggestions to see *why*
      the model proposed them.
- [ ] Check cost: Gemini usage in the GCP console (plan budgets <$5/mo).
- [ ] Confirm costs overall hold under ~$15/mo (Cloud Run + Cloud SQL + Gemini).

---

## 5. Definition of done for the beta (plan §20)

- [ ] A new group onboards in <2 min.
- [ ] "jemaw" surfaces ≥1 correct suggestion within 5s, ~80% of the time, in a
      50-message window with multiple expense events.
- [ ] A full session (open → review 5 → settle → mark paid) under 30s.
- [ ] You and your group use it on a real trip and don't reach for a calculator.

---

## 6. Incident quick-reference

| Symptom | First check |
|---|---|
| No suggestions ever | privacy mode off? messages captured? |
| `api_error` in ai_runs | Gemini key valid + has quota? |
| `parse_error` | model returned non-JSON; check `raw_response`; tighten prompt |
| Bot unresponsive | `curl $URL/health`; Cloud Run logs; webhook `getWebhookInfo` |
| Wrong payer often | prompt tweak: emphasize "who paid" cues |
