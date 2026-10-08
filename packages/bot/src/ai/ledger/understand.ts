/**
 * Ask the model what a message addressed to Jemaw actually wants: a ledger
 * answer (and exactly which one), a chat scan, banter, or a redo of the last
 * answer. Keyword rules in humor/intent.ts stay as the fallback whenever this
 * returns null (no client, bad output, error or timeout).
 */
import { z } from "zod";
import type { ScanClient } from "../geminiClient.js";
import type { LedgerQuery, LedgerQuestionKind } from "../humor/intent.js";

export interface Understanding {
  intent: "ledger" | "scan" | "chat" | "correction";
  /** Present for ledger and correction. */
  query?: LedgerQuery;
}

const KINDS = [
  "whoami",
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
  'Return JSON only: {"intent":"ledger|scan|chat|correction","kind":"whoami|my_balance|who_owes|expense_list|totals|pending|overview|null","period":"week|month|all","days":number|null,"limit":number|null,"mine":"paid|involved|null"}.',
  "ledger: a question or request about the group's records: who am I, my balance, who owes whom, listing expenses, totals or who spent most, pending drafts, a summary.",
  "scan: the message reports a NEW money event to record (someone paid, spent, lent or paid back) or explicitly asks to scan or check the chat.",
  "correction: the user says Jemaw's previous answer was wrong or not what they asked. Use previous_question to fill kind, days, limit and mine with what they really wanted.",
  "chat: greetings, banter and everything else.",
  "kind: whoami for 'who am I'. my_balance for what I owe or am owed. who_owes for everyone's debts. expense_list for listing expenses. totals for sums and top spenders.",
  "mine: paid when they mean expenses they paid ('my expenses', 'what I paid'); involved when they mean everything they were part of; otherwise null.",
  "days: for 'last N days' or 'today' (1). limit: for 'latest N' or 'N of them'. period: week or month when they say so, else all.",
  "People type fast with typos ('own' means 'owe'). Answer with JSON only.",
].join(" ");

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
    const query: LedgerQuery = { kind: o.kind, period: o.period ?? "all" };
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
