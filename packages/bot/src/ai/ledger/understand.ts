/**
 * Ask the model what a message addressed to Jemaw actually wants: a ledger
 * answer (and exactly which one), a chat scan, banter, or a redo of the last
 * answer. Keyword rules in humor/intent.ts stay as the fallback whenever this
 * returns null (no client, bad output, error or timeout).
 */
import { z } from "zod";
import type { ScanClient } from "../geminiClient.js";
import { isAboutMe, type LedgerQuery, type LedgerQuestionKind } from "../humor/intent.js";

export interface Understanding {
  intent: "ledger" | "scan" | "chat" | "correction";
  /** Present for ledger and correction. */
  query?: LedgerQuery;
}

const KINDS = [
  "whoami",
  "leaderboard",
  "my_balance",
  "who_owes",
  "expense_list",
  "totals",
  "pending",
  "overview",
] as const satisfies readonly LedgerQuestionKind[];

const schema = z.object({
  intent: z.enum(["ledger", "scan", "chat", "correction"]),
  kind: z.enum(KINDS).nullable().optional(),
  period: z.enum(["week", "month", "all"]).nullable().optional(),
  days: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  mine: z.enum(["paid", "involved"]).nullable().optional(),
});

const SYSTEM_PROMPT = [
  "You route messages that address Jemaw, the expense bot of a Telegram friend group.",
  'Return JSON only: {"intent":"ledger|scan|chat|correction","kind":"whoami|leaderboard|my_balance|who_owes|expense_list|totals|pending|overview|null","period":"week|month|all","days":number|null,"limit":number|null,"mine":"paid|involved|null"}.',
  "ledger: a question or request about the group's records: who am I, who is the rich or broke one, my balance, who owes whom, open or unsettled payments, listing expenses, totals or who spent most, drafts waiting for review, a summary.",
  "scan: the message reports a NEW money event to record (someone paid, spent, lent or paid back) or explicitly asks to scan or check the chat.",
  "correction: the user says Jemaw's previous answer was wrong or not what they asked. Use previous_question to fill kind, days, limit and mine with what they really wanted.",
  "chat: greetings, banter and everything else.",
  "kind: whoami for 'who am I'. leaderboard for who is rich, broke, cheap, generous, the biggest spender or who owes the most. my_balance ONLY when the sender asks about their own money with I, me or my ('what do I owe', 'who owes me'). who_owes for open, pending, unsettled or outstanding payments, settlements or debts in general, and for what a named person owes. pending ONLY for drafts or expenses waiting for review in the app, never for payments or settlements. expense_list for listing expenses. totals for sums and top spenders.",
  "mine: paid when they mean expenses they paid ('my expenses', 'what I paid'); involved when they mean everything they were part of; otherwise null.",
  "days: for 'last N days' or 'today' (1). limit: for 'latest N' or 'N of them'. period: week or month when they say so, else all.",
  "People type fast with typos ('own' means 'owe'). Answer with JSON only.",
].join(" ");

/**
 * The model sometimes answers with the asker's own payments or the drafts
 * queue when the message asked neither; fall back to everyone's open payments.
 */
function guardKind(kind: LedgerQuestionKind, text: string): LedgerQuestionKind {
  if (kind === "my_balance" && !isAboutMe(text)) return "who_owes";
  if (kind === "pending" && !/\b(drafts?|unconfirmed|review|suggestions?)\b/i.test(text)) return "who_owes";
  return kind;
}

export async function understandMessage(input: {
  client: ScanClient;
  text: string;
  previous?: { text: string; kind: LedgerQuestionKind };
  timeoutMs?: number;
}): Promise<Understanding | null> {
  const call = input.client.suggest({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify({
      message: input.text.slice(0, 300),
      ...(input.previous
        ? { previous_question: input.previous.text.slice(0, 300), previous_answer_kind: input.previous.kind }
        : {}),
    }),
    temperature: 0,
    maxTokens: 300,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), input.timeoutMs ?? 4000);
  });
  try {
    const res = await Promise.race([call, timeout]);
    if (!res) {
      console.warn(`[understand] timed out`);
      return null;
    }
    const parsed = schema.safeParse(res.json);
    if (!parsed.success) {
      console.warn(`[understand] unexpected output`);
      return null;
    }
    const o = parsed.data;
    if (o.intent === "chat" || o.intent === "scan") return { intent: o.intent };
    if (!o.kind) return null;
    const query: LedgerQuery = { kind: o.intent === "ledger" ? guardKind(o.kind, input.text) : o.kind, period: o.period ?? "all" };
    if (o.days != null && o.days >= 1) query.days = Math.min(365, Math.round(o.days));
    if (o.limit != null && o.limit >= 1) query.limit = Math.min(50, Math.round(o.limit));
    if (o.mine) query.mine = o.mine;
    return { intent: o.intent, query };
  } catch (err) {
    console.warn(`[understand] failed:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
