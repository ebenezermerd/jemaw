/**
 * The one-line personality Jemaw adds under an exact ledger answer: friendly
 * bragging about whoever carries the group and playful guilt-trips for whoever
 * owes. The model line must pass the fact-lock verifier against the snapshot;
 * otherwise a template line is used so the answer is never held up.
 */
import type { HumorMode } from "@jemaw/shared/humor";
import type { ScanClient } from "../geminiClient.js";
import type { LedgerQuery } from "../humor/intent.js";
import { buildDirectChatPacket } from "../humor/factPacket.js";
import { verifyCandidate } from "../humor/verifier.js";
import { cleanReplyPunctuation } from "../humor/punctuation.js";
import { bossToneRule } from "../humor/boss.js";
import type { BossTone } from "@jemaw/shared/boss";
import { groupDigits } from "../../telegram/announcements.js";
import {
  ledgerHighlights,
  ledgerNames,
  ledgerNumberTokens,
  formatCents,
  plainAmount,
  type LedgerSnapshot,
} from "./snapshot.js";

const PERSONA_MAX_TOKENS = 320;

export interface PersonaLine {
  text: string;
  source: "model" | "template";
  inputTokens?: number;
  outputTokens?: number;
}

const MODE_TONE: Record<Exclude<HumorMode, "off">, string> = {
  jemaw_dry: "deadpan and understated, a raised eyebrow rather than a roast",
  roast: "sharp teasing between close friends, a proper roast that still lands as love",
  chaos: "dramatic and absurd, theatrical outrage and over-the-top praise",
};

/**
 * "Who is the rich guy" gets no table: the reply itself is the answer, said
 * the way a friend in the chat would say it.
 */
function bragPrompt(mode: Exclude<HumorMode, "off">): string {
  return [
    "You are Jemaw, the meddlesome spirit living in a friend group's shared expense ledger, chatting in the group.",
    "ASKER asked who the rich or broke one is. There is no table or summary: your reply IS the whole answer, so it must read like a chat message, not a report.",
    `Tone: ${MODE_TONE[mode]}.`,
    "Crown FOCUS.rich_one as the rich one with how much they paid for the group, and call out FOCUS.broke_one with how much they owe when present. Never swap in ASKER for either role, though you may tease ASKER for asking.",
    "Every reply should feel fresh: vary the opening, the metaphor and the order. Do not open with 'Oh' or with ASKER's name, and never say 'leaderboard'. No headings, no lists, no emojis beyond one.",
    "It is spending, not real wealth, so keep it a joke. Friendly ribbing only: never cruel, never about poverty, worth, family or appearance.",
    "Never use em dashes, en dashes or semicolons. Say paid or paid for, never fronted.",
    "Only use names and numbers that appear in FACTS. Write numbers exactly as given, without thousands separators, followed by the currency.",
    'Return JSON only: {"candidates":[{"text":"..."},{"text":"..."}]} with 2 candidates, each one or two sentences and at most 40 words.',
  ].join(" ");
}

function systemPrompt(mode: Exclude<HumorMode, "off">): string {
  return [
    "You are Jemaw, the meddlesome spirit living in a friend group's shared expense ledger.",
    "The exact ledger answer has already been shown. You add ONE short line of personality under it.",
    `Tone: ${MODE_TONE[mode]}.`,
    "Talk to ASKER by name. React to FOCUS, the answer that was just shown, and pick ONE angle: brag about whoever carries the group or playfully guilt-trip whoever owes, including ASKER if they owe.",
    "Do not default to praising ASKER; aim at whoever FOCUS makes interesting. If everyone is square, joke about the peace or the spending instead.",
    "Friendly ribbing only: never cruel, never about poverty, worth, family or appearance.",
    "Never use em dashes, en dashes or semicolons. Say paid or paid for, never fronted.",
    "Only use names and numbers that appear in FACTS. Write numbers exactly as given, without thousands separators. Do not restate the whole answer.",
    'Return JSON only: {"candidates":[{"text":"..."},{"text":"..."}]} with 2 candidates, each one sentence of at most 30 words.',
  ].join(" ");
}

export async function composeLedgerPersonaLine(input: {
  client?: ScanClient;
  mode: Exclude<HumorMode, "off">;
  snapshot: LedgerSnapshot;
  query: LedgerQuery;
  rng?: () => number;
  /** Set when a super admin asked: how gently to treat them. */
  bossTone?: BossTone;
}): Promise<PersonaLine> {
  const s = input.snapshot;
  const highlights = ledgerHighlights(s);
  const packet = buildDirectChatPacket({
    pendingCount: s.pending.count,
    currency: s.currency,
    addressedUtterance: "",
    addressedBy: s.asker?.name,
    allowedTargetNames: ledgerNames(s),
    ledger: highlights,
  });
  packet.allowed_number_tokens = [
    ...new Set([...(packet.allowed_number_tokens ?? []), ...ledgerNumberTokens(s)]),
  ];
  // Expense descriptions are capitalized words the verifier must not mistake for names.
  packet.public_facts.draft_labels = [
    ...s.expenses.map((e) => e.description),
    ...(s.stats.biggest ? [s.stats.biggest.description] : []),
    ...s.pending.drafts.map((d) => d.label),
  ];

  // One retry: Groq occasionally rejects its own JSON ("Failed to validate JSON").
  for (let attempt = 0; input.client && attempt < 2; attempt++) {
    try {
      const res = await input.client.suggest({
        systemPrompt: [
          input.query.kind === "leaderboard" ? bragPrompt(input.mode) : systemPrompt(input.mode),
          bossToneRule(input.bossTone, s.asker?.name),
        ]
          .filter(Boolean)
          .join(" "),
        userPrompt: `FACTS:${JSON.stringify({
          asker: s.asker?.name ?? null,
          asker_net: s.asker ? plainAmount(s.asker.netCents) : null,
          asker_is: s.asker ? (s.asker.netCents < 0 ? "in_debt" : s.asker.netCents > 0 ? "owed_money" : "square") : null,
          currency: s.currency,
          question: input.query.kind,
          focus: focusFor(input.query, s),
          ledger: highlights,
          spent_this_month: plainAmount(s.stats.monthCents),
          pending_drafts: s.pending.count,
        })}`,
        // The retry runs cooler: Groq's JSON validator trips more often on hot samples.
        temperature:
          attempt > 0 ? 0.4 : input.mode === "chaos" ? 0.9 : input.mode === "roast" ? 0.8 : 0.6,
        maxTokens: PERSONA_MAX_TOKENS,
      });
      const list = (res.json as { candidates?: { text?: unknown }[] })?.candidates ?? [];
      for (const c of Array.isArray(list) ? list : []) {
        const text = String(c?.text ?? "").trim();
        if (text && verifyCandidate(text, packet).ok) {
          return {
            text: groupNumbers(cleanReplyPunctuation(text)),
            source: "model",
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
          };
        }
      }
      console.log(`[ledger] persona model lines rejected by verifier`);
      break;
    } catch (err) {
      console.warn(
        `[ledger] persona model failed (attempt ${attempt + 1}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    text: cleanReplyPunctuation(templateLine(s, input.query, input.rng ?? Math.random)),
    source: "template",
  };
}

/** The facts behind the answer that was just shown, so the line reacts to it. */
function focusFor(query: LedgerQuery, s: LedgerSnapshot): Record<string, unknown> {
  const amt = (name: string, cents: number) => ({ name, amount: plainAmount(cents) });
  const debts = s.openDebts.slice(0, 3).map((d) => ({ from: d.from, to: d.to, amount: plainAmount(d.cents) }));
  const rows = s.expenses.filter((e) =>
    query.mine === "paid" ? e.askerPaid : query.mine === "involved" ? e.askerPaid || e.askerShared : true,
  );
  switch (query.kind) {
    case "leaderboard": {
      const rich = s.stats.paidByMember[0];
      const broke = [...s.balances].sort((a, z) => a.netCents - z.netCents)[0];
      const owed = s.balances.find((x) => x.netCents > 0);
      return {
        rich_one: rich ? { name: rich.name, paid: plainAmount(rich.cents) } : null,
        ...(broke && broke.netCents < 0 ? { broke_one: { name: broke.name, owes: plainAmount(broke.netCents) } } : {}),
        ...(owed ? { owed_most: amt(owed.name, owed.netCents) } : {}),
      };
    }
    case "whoami":
      return {
        asker: s.asker?.name ?? null,
        paid_expenses: s.asker?.paidCount ?? 0,
        paid_total: s.asker ? plainAmount(s.asker.paidCents) : "0",
      };
    case "my_balance":
      return {
        asker_owes: s.asker?.owes.map((o) => amt(o.name, o.cents)) ?? [],
        asker_owed_by: s.asker?.owedBy.map((o) => amt(o.name, o.cents)) ?? [],
      };
    case "who_owes":
      return debts.length ? { open_debts: debts } : { all_square: true };
    case "expense_list": {
      const latest = rows[0];
      const biggest = [...rows].sort((a, b) => b.cents - a.cents)[0];
      return {
        only_askers_expenses: query.mine != null,
        latest: latest ? { what: latest.description, amount: plainAmount(latest.cents), payer: latest.payer } : null,
        biggest_recent: biggest ? { what: biggest.description, amount: plainAmount(biggest.cents), payer: biggest.payer } : null,
      };
    }
    case "totals":
      return {
        spent_all_time: plainAmount(s.stats.allTimeCents),
        top_spender_this_month: s.stats.topSpenderMonth ? amt(s.stats.topSpenderMonth.name, s.stats.topSpenderMonth.cents) : null,
        top_spender_all_time: s.stats.topSpenderAllTime ? amt(s.stats.topSpenderAllTime.name, s.stats.topSpenderAllTime.cents) : null,
        biggest_expense: s.stats.biggest
          ? { what: s.stats.biggest.description, amount: plainAmount(s.stats.biggest.cents), payer: s.stats.biggest.payer }
          : null,
      };
    case "pending":
      return { pending_drafts: s.pending.count, labels: s.pending.drafts.map((d) => d.label) };
    case "overview":
      return {
        open_debts: debts,
        top_spender_all_time: s.stats.topSpenderAllTime ? amt(s.stats.topSpenderAllTime.name, s.stats.topSpenderAllTime.cents) : null,
        pending_drafts: s.pending.count,
      };
  }
}

/** The model writes 43140.66 so the verifier can match it; people read 43,140.66. */
function groupNumbers(text: string): string {
  return text.replace(/\b\d{4,}(?:\.\d+)?\b/g, (n) => groupDigits(n));
}

function pick<T>(list: T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)] ?? list[0]!;
}

function templateLine(s: LedgerSnapshot, query: LedgerQuery, rng: () => number): string {
  const asker = s.asker;
  if (query.kind === "leaderboard") return bragTemplate(s, rng);
  const top = s.stats.topSpenderMonth?.name;
  const debtor = [...s.balances].sort((a, b) => a.netCents - b.netCents)[0];
  if (asker && asker.netCents < 0) {
    return pick(
      [
        `${asker.name}, the ledger has noticed. It's not angry, just disappointed.`,
        `${asker.name}, pay up before the ledger starts a group chat about you.`,
        `${asker.name}, every unpaid birr adds a wrinkle to my pages.`,
      ],
      rng,
    );
  }
  if (asker && asker.netCents > 0) {
    return pick(
      [
        `${asker.name}, you're basically the group's bank. Interest-free, sadly.`,
        `${asker.name} out here funding everyone's lifestyle. Respect.`,
      ],
      rng,
    );
  }
  if (debtor && debtor.netCents < 0) {
    return pick(
      [
        `${debtor.name}, the books whisper your name at night.`,
        top
          ? `${top} carrying the group's economy while ${debtor.name} carries the debt.`
          : `${debtor.name}, the ledger is keeping a seat warm for your payment.`,
      ],
      rng,
    );
  }
  return pick(
    ["Spotless books. Suspiciously spotless.", "Everyone's square. I've never been so bored."],
    rng,
  );
}

/** The fallback answer to "who is the rich one", in the same chat voice. */
function bragTemplate(s: LedgerSnapshot, rng: () => number): string {
  const richest = s.stats.paidByMember[0];
  if (!richest) return "Nobody has paid for anything yet, so you're all equally broke. Beautiful.";
  const rich = richest.name;
  const paid = `${formatCents(richest.cents)} ${s.currency}`;
  const worst = [...s.balances].sort((a, z) => a.netCents - z.netCents)[0];
  if (!worst || worst.netCents >= 0) {
    return pick(
      [
        `${rich}, obviously. ${paid} paid and the books are still square. Disgustingly responsible.`,
        `That would be ${rich} with ${paid} paid. Nobody owes anybody, so I have nobody to roast. Tragic.`,
      ],
      rng,
    );
  }
  const broke = worst.name;
  const owes = `${formatCents(-worst.netCents)} ${s.currency}`;
  return pick(
    [
      `${rich} is clearly the group's sugar daddy with ${paid} paid. ${broke}, ${owes} in the hole, start saving.`,
      `${rich} funds the group, ${paid} and counting. ${broke} funds the chat with excuses and owes ${owes}.`,
      `Rich one? ${rich}, ${paid} paid out like it's nothing. Broke one? ${broke}, still sitting on ${owes} of everyone's money.`,
      `${rich} has paid ${paid}, basically the group's walking ATM. ${broke} is the one tapping the card with ${owes} owed.`,
    ],
    rng,
  );
}
