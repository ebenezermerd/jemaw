// Turns an action request into a card of real rows to pick from. Never writes.
import type { Db } from "../db.js";
import type { Group, Member } from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import { listPendingSuggestions, listSettlements } from "../repo.js";
import { loadLedger } from "../domain/ledger.js";
import { COVERAGE_TOLERANCE_CENTS } from "../domain/pairwiseDebt.js";
import { computeSplit } from "../domain/splits.js";
import { namedMember } from "../ai/ledger/answer.js";
import { formatCents } from "../ai/ledger/snapshot.js";
import type { ActionOption, ActionRequest, PlanResult } from "./types.js";

export const MAX_OPTIONS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const ME_RE = /^(me|i|my|mine|myself|me myself)$/i;

export function resolveMember(word: string | undefined, members: Member[], actor: Member): Member | null {
  const w = word?.trim();
  if (!w) return null;
  if (ME_RE.test(w)) return actor;
  const active = members.filter((m) => m.isActive);
  const name = namedMember(w, active.map((m) => m.displayName));
  return name ? (active.find((m) => m.displayName === name) ?? null) : null;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Africa/Addis_Ababa" });
}

function matchWords(match: string | undefined): string[] {
  const skip = new Set(["the", "a", "an", "all", "my", "mine", "draft", "drafts", "expense", "expenses", "payment", "payments", "one", "of", "for", "from", "to", "jemaw", "please", "pls", "yesterday", "yesterdays", "today", "todays"]);
  return (match ?? "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !skip.has(w));
}

function dayFilter(match: string | undefined, now: Date): ((d: Date) => boolean) | null {
  const m = (match ?? "").toLowerCase();
  const day = (offset: number) => {
    const local = new Date(now.getTime() + 3 * 60 * 60 * 1000 - offset * DAY_MS).toISOString().slice(0, 10);
    return (d: Date) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) === local;
  };
  if (/\byesterday/.test(m)) return day(1);
  if (/\btoday|tonight/.test(m)) return day(0);
  return null;
}

const matches = (words: string[], ...texts: (string | null | undefined)[]) => {
  if (words.length === 0) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};

const when = (s: { occurredAt: Date | null; createdAt: Date }) => (s.occurredAt ?? s.createdAt).getTime();

const money = (cents: number, currency: string) => `${formatCents(cents)} ${currency}`;

export async function planAction(
  db: Db,
  group: Group,
  actor: Member,
  req: ActionRequest,
  now = new Date(),
): Promise<PlanResult> {
  const cur = group.defaultCurrency;
  const ledger = await loadLedger(db, group.id);
  const nameOf = (id: string | null) => ledger.members.find((m) => m.id === id)?.displayName ?? "Someone";

  switch (req.action) {
    case "settle": {
      const to = resolveMember(req.to, ledger.members, actor);
      const from = resolveMember(req.from, ledger.members, actor) ?? (to && to.id !== actor.id ? actor : null);
      if (!to || !from) {
        return { message: "Who's paying whom? Try: jemaw settle mine to Pomi." };
      }
      if (to.id === from.id) return { message: "That's the same person on both sides." };
      const owed = ledger.transfers.find((t) => t.fromMemberId === from.id && t.toMemberId === to.id);
      if (!owed) return { message: `${from.displayName} doesn't owe ${to.displayName} anything right now.` };

      const residual = (expenseId: string) => {
        const e = ledger.expensesForDebt.find((x) => x.expenseId === expenseId);
        const share = e?.shares.find((s) => s.memberId === from.id);
        if (!share) return 0;
        const paid = ledger.allocations
          .filter((a) => a.expenseId === expenseId && a.memberId === from.id)
          .reduce((sum, a) => sum + a.allocatedCents, 0);
        return Math.max(0, share.shareCents - paid);
      };
      const open = ledger.liveExpenses
        .filter((e) => e.expense.payerMemberId === to.id && residual(e.expense.id) > COVERAGE_TOLERANCE_CENTS)
        .sort((a, b) => a.expense.occurredAt.getTime() - b.expense.occurredAt.getTime());
      if (open.length === 0) return { message: `${from.displayName} has nothing open with ${to.displayName}.` };
      const shown = open.slice(0, MAX_OPTIONS);
      const who = from.id === actor.id ? "You pay" : `${from.displayName} pays`;
      const whom = to.id === actor.id ? "you" : to.displayName;
      return {
        plan: {
          kind: "settle",
          title: `${who} ${whom} · ${money(owed.amountCents, cur)} open in total. Pick what this payment covers:`,
          payload: { fromMemberId: from.id, toMemberId: to.id, fromName: from.displayName, toName: to.displayName, more: open.length - shown.length },
          options: shown.map((e) => ({
            id: e.expense.id,
            label: `${e.expense.description} · ${money(residual(e.expense.id), cur)} · ${shortDate(e.expense.occurredAt)}`,
          })),
          multi: true,
          selected: shown.map((_, i) => i),
        },
      };
    }

    case "approve_drafts":
    case "dismiss_drafts": {
      const words = matchWords(req.match);
      const pending = (await listPendingSuggestions(db, group.id))
        .filter((s) => matches(words, s.description, nameOf(s.payerMemberId)))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (pending.length === 0) {
        return { message: words.length ? `No drafts waiting that match "${req.match}".` : "No drafts waiting right now." };
      }
      const shown = pending.slice(0, MAX_OPTIONS);
      const approve = req.action === "approve_drafts";
      return {
        plan: {
          kind: req.action,
          title: approve
            ? "Pick the drafts to add to the ledger:"
            : "Pick the drafts to dismiss. They won't be added to the ledger:",
          payload: { more: pending.length - shown.length },
          options: shown.map((s) => ({
            id: s.id,
            label: [
              s.description,
              s.amount ? money(decimalToCents(s.amount), cur) : "no amount",
              s.kind === "settlement" ? `${nameOf(s.fromMemberId)} → ${nameOf(s.toMemberId)}` : s.payerMemberId ? `by ${nameOf(s.payerMemberId)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
          multi: true,
          selected: words.length ? shown.map((_, i) => i) : [],
        },
      };
    }

    case "add_expense": {
      const amountCents = req.amount ? decimalToCents(req.amount.replace(/,/g, "")) : NaN;
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return { message: "How much was it? Try: jemaw add 600 for lunch with Aman and Pomi." };
      }
      const description = req.description?.trim().slice(0, 200) || "Expense";
      const payer = resolveMember(req.from, ledger.members, actor) ?? actor;
      const names = (req.participants ?? []).filter((n) => !/^(all|everyone|everybody|us|we)$/i.test(n.trim()));
      let splitWith: Member[];
      if (names.length === 0) {
        splitWith = ledger.members.filter((m) => m.isActive);
      } else {
        const found: Member[] = [];
        for (const n of names) {
          const m = resolveMember(n, ledger.members, actor);
          if (!m) return { message: `I can't find "${n}" in this group.` };
          if (!found.some((f) => f.id === m.id)) found.push(m);
        }
        if (!found.some((f) => f.id === payer.id)) found.unshift(payer);
        splitWith = found;
      }
      const split = computeSplit({ totalCents: amountCents, splitType: "equal", memberIds: splitWith.map((m) => m.id) });
      const parts = split.map((p) => `${nameOf(p.memberId)} ${formatCents(p.shareCents)}`).join(", ");
      return {
        plan: {
          kind: "add_expense",
          title: `Add "${description}" · ${money(amountCents, cur)} paid by ${payer.displayName}, split equally: ${parts}.`,
          payload: {
            description,
            amount: centsToDecimal(amountCents),
            payerMemberId: payer.id,
            splitWith: splitWith.map((m) => m.id),
          },
          options: [],
          multi: false,
          selected: [],
        },
      };
    }

    case "delete_expense": {
      const words = matchWords(req.match ?? req.description);
      const onDay = dayFilter(req.match ?? req.description, now);
      const amountCents = req.amount ? decimalToCents(req.amount.replace(/,/g, "")) : null;
      const found = ledger.liveExpenses
        .filter((e) => matches(words, e.expense.description, nameOf(e.expense.payerMemberId)))
        .filter((e) => (onDay ? onDay(e.expense.occurredAt) : true))
        .filter((e) => (amountCents ? decimalToCents(e.expense.amount) === amountCents : true))
        .sort((a, b) => b.expense.occurredAt.getTime() - a.expense.occurredAt.getTime())
        .slice(0, 5);
      if (found.length === 0) return { message: "I couldn't find that expense. Try its name, like: jemaw delete yesterday's lunch." };
      return {
        plan: {
          kind: "delete_expense",
          title: "Pick the expense to delete. You can restore it in the app:",
          payload: {},
          options: found.map((e) => ({
            id: e.expense.id,
            label: `${e.expense.description} · ${money(decimalToCents(e.expense.amount), cur)} by ${nameOf(e.expense.payerMemberId)} · ${shortDate(e.expense.occurredAt)}`,
          })),
          multi: false,
          selected: found.length === 1 ? [0] : [],
        },
      };
    }

    case "delete_payment": {
      const from = resolveMember(req.from, ledger.members, actor);
      const to = resolveMember(req.to, ledger.members, actor);
      const words = matchWords(req.match);
      const found = (await listSettlements(db, group.id))
        .filter((s) => (from ? s.fromMemberId === from.id : true) && (to ? s.toMemberId === to.id : true))
        .filter((s) => matches(words, nameOf(s.fromMemberId), nameOf(s.toMemberId), s.description))
        .sort((a, b) => when(b) - when(a))
        .slice(0, 5);
      if (found.length === 0) return { message: "I couldn't find that payment." };
      return {
        plan: {
          kind: "delete_payment",
          title: "Pick the payment to delete. What it covered becomes owed again:",
          payload: {},
          options: found.map((s) => ({
            id: s.id,
            label: `${nameOf(s.fromMemberId)} → ${nameOf(s.toMemberId)} · ${money(decimalToCents(s.amount), cur)} · ${shortDate(new Date(when(s)))}`,
          })),
          multi: false,
          selected: found.length === 1 ? [0] : [],
        },
      };
    }
  }
}

export type { ActionOption };
