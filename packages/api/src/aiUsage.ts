/**
 * AI usage for the console: calls and tokens from ai_runs (scans) and
 * bot_replies (chat), each group's daily reply cap, and Groq's remaining
 * limits (saved by the bot after each call, or fetched with a tiny check).
 */
import { sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { groups } from "@jemaw/shared/schema";
import { HUMOR_MODE_LIMITS, parseHumorSettings } from "@jemaw/shared/humor";
import {
  BOT_AI_LIMITS_KEY,
  limitsFromHeaders,
  type AiLimitsSnapshot,
} from "@jemaw/shared/runtimeConfig";
import type { AdminAiUsageDto } from "@jemaw/shared/types";
import { aiCallsByGroupSince, getConfig, setConfig } from "./repo.js";
import { parseGroupAccess } from "@jemaw/shared/groupAccess";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

type Row = Record<string, string | number | null>;
const n = (v: unknown) => Number(v ?? 0);

export async function aiUsage(
  db: Db,
  opts: { now: Date; days?: number; model: string; canCheck: boolean },
): Promise<AdminAiUsageDto> {
  const days = opts.days ?? 14;
  const dayStart = new Date(opts.now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(dayStart.getTime() - (days - 1) * 86_400_000);

  const perDay = (await db.execute(sql`
    select to_char(d, 'YYYY-MM-DD') as date,
      (select count(*) from ai_runs r where r.created_at >= d and r.created_at < d + interval '1 day') as scans,
      (select count(*) from bot_replies b where b.created_at >= d and b.created_at < d + interval '1 day' and b.input_tokens is not null) as replies,
      (select coalesce(sum(coalesce(r.input_tokens,0) + coalesce(r.output_tokens,0)),0) from ai_runs r where r.created_at >= d and r.created_at < d + interval '1 day')
      + (select coalesce(sum(coalesce(b.input_tokens,0) + coalesce(b.output_tokens,0)),0) from bot_replies b where b.created_at >= d and b.created_at < d + interval '1 day') as tokens
    from generate_series(${since.toISOString()}::timestamptz, ${dayStart.toISOString()}::timestamptz, interval '1 day') d
    order by d
  `)) as unknown as Row[];

  const [t] = (await db.execute(sql`
    select
      (select count(*) from ai_runs where created_at >= ${dayStart.toISOString()}::timestamptz) as scans,
      (select count(*) from bot_replies where created_at >= ${dayStart.toISOString()}::timestamptz and input_tokens is not null) as replies,
      (select coalesce(sum(input_tokens),0) from ai_runs where created_at >= ${dayStart.toISOString()}::timestamptz)
        + (select coalesce(sum(input_tokens),0) from bot_replies where created_at >= ${dayStart.toISOString()}::timestamptz) as input,
      (select coalesce(sum(output_tokens),0) from ai_runs where created_at >= ${dayStart.toISOString()}::timestamptz)
        + (select coalesce(sum(output_tokens),0) from bot_replies where created_at >= ${dayStart.toISOString()}::timestamptz) as output,
      (select count(*) from ai_runs where created_at >= ${dayStart.toISOString()}::timestamptz and status <> 'success')
        + (select count(*) from bot_replies where created_at >= ${dayStart.toISOString()}::timestamptz and decision = 'failed') as errors
  `)) as unknown as Row[];

  // ai_runs has no model column; scans run on the configured model.
  const byModel = (await db.execute(sql`
    select coalesce(model, 'templates') as model, count(*) as calls,
           coalesce(sum(coalesce(input_tokens,0) + coalesce(output_tokens,0)),0) as tokens
      from bot_replies
     where created_at >= ${new Date(dayStart.getTime() - 6 * 86_400_000).toISOString()}::timestamptz
     group by 1 order by 2 desc
  `)) as unknown as Row[];

  const sentToday = (await db.execute(sql`
    select group_id, count(*) as n from bot_replies
     where decision = 'sent' and created_at > ${dayStart.toISOString()}::timestamptz
     group by group_id
  `)) as unknown as Row[];
  const sentBy = new Map(sentToday.map((r) => [String(r.group_id), n(r.n)]));
  const groupRows = await db.select({ id: groups.id, name: groups.name, settings: groups.settings }).from(groups);
  const aiCalls = await aiCallsByGroupSince(db, dayStart);

  const scans = n(t?.scans);
  const replies = n(t?.replies);
  return {
    today: {
      calls: scans + replies,
      scans,
      replies,
      inputTokens: n(t?.input),
      outputTokens: n(t?.output),
      errors: n(t?.errors),
    },
    days: perDay.map((r) => ({ date: String(r.date), scans: n(r.scans), replies: n(r.replies), tokens: n(r.tokens) })),
    byModel: byModel.map((r) => ({ model: String(r.model), calls: n(r.calls), tokens: n(r.tokens) })),
    groups: groupRows
      .map((g) => {
        const h = parseHumorSettings((g.settings as Record<string, unknown> | null)?.humor);
        const access = parseGroupAccess((g.settings as Record<string, unknown> | null)?.access, opts.now);
        // Same cap the bot applies (deliver.ts maxRepliesForMode).
        const maxPerDay = h.mode === "off" ? 0 : h.maxPublicRepliesPerDay || HUMOR_MODE_LIMITS[h.mode].maxPublicRepliesPerDay;
        return {
          groupId: g.id,
          groupName: g.name,
          access: access.status,
          aiCallsToday: aiCalls.get(g.id) ?? 0,
          aiDailyLimit: access.aiDailyLimit,
          mode: h.mode,
          repliesToday: sentBy.get(g.id) ?? 0,
          maxPerDay,
          mutedUntil: h.mutedUntil && Date.parse(h.mutedUntil) > opts.now.getTime() ? h.mutedUntil : null,
        };
      })
      .sort((a, b) => b.aiCallsToday - a.aiCallsToday || b.repliesToday - a.repliesToday || a.groupName.localeCompare(b.groupName)),
    limits: ((await getConfig(db, BOT_AI_LIMITS_KEY)) as AiLimitsSnapshot | null) ?? null,
    canCheck: opts.canCheck,
    model: opts.model,
  };
}

/**
 * Ask Groq for the current limits with the smallest possible request (one
 * output token) and save the answer like the bot does.
 */
export async function checkGroqLimits(
  db: Db,
  opts: { apiKey: string; model: string; now: Date; fetchImpl?: typeof fetch },
): Promise<AiLimitsSnapshot | { error: string }> {
  const res = await (opts.fetchImpl ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: opts.model, max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
    signal: AbortSignal.timeout(15_000),
  }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
  if ("error" in res) return { error: res.error };
  // A 429 still carries the limit headers, which is exactly what we want to show.
  const snap = limitsFromHeaders((h) => res.headers.get(h), { model: opts.model, source: "check", now: opts.now });
  if (!snap) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    return { error: `Groq answered ${res.status} without limit headers${body ? `: ${body}` : ""}` };
  }
  await setConfig(db, BOT_AI_LIMITS_KEY, snap, "console");
  return snap;
}
