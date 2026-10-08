/**
 * scanGroup — one Gemini scan of a group's recent chat (JEMAW_PLAN.md §6).
 * In-process, DB-backed. Never throws to the caller: failures are recorded in
 * ai_runs and surface nothing. Returns the count of suggestions written (for
 * the pinned-message badge).
 */
import type { Db } from "../db.js";
import type { ScanClient } from "./geminiClient.js";
import { SYSTEM_PROMPT, buildUserPrompt, type ScanData } from "./prompt.js";
import { scanResponseSchema, tierFor } from "./scanSchema.js";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import {
  listMembers,
  lastNMessages,
  createAiRun,
  insertSuggestions,
  setLastScanMessageId,
  countPendingSuggestions,
  handledEvidenceMessageIds,
  countLiveExpenses,
  countSettlements,
  listLiveExpenses,
  listSettlementAllocations,
} from "../repo.js";
import { getSummaryForScan } from "./summary.js";
import {
  deriveExpenseDebts,
  type ExpenseForDebt,
  type AllocationForDebt,
} from "../domain/pairwiseDebt.js";
import type { Group } from "@jemaw/shared/schema";

const MAX_MESSAGES = 10;

export interface ScanDeps {
  db: Db;
  gemini: ScanClient;
  now: () => number; // ms
}

export interface ScanResult {
  status: "success" | "parse_error" | "api_error" | "no_messages";
  written: number;
  pendingCount: number;
  /** Telegram message ids the AI used as evidence for the new suggestions, so
   *  the caller can badge those source messages with a reaction. */
  evidenceMessageIds: number[];
}

export async function scanGroup(
  deps: ScanDeps,
  group: Group,
  triggeredByMemberId: string | null,
  triggerType: "keyword" | "command" | "manual",
): Promise<ScanResult> {
  const { db, gemini } = deps;
  const members = await listMembers(db, group.id);
  const msgs = await lastNMessages(db, group.id, MAX_MESSAGES);
  console.log(
    `[scan] group=${group.id} members=${members.length} messages=${msgs.length}`,
  );

  if (msgs.length === 0) {
    console.log(`[scan] no messages to scan`);
    return {
      status: "no_messages",
      written: 0,
      pendingCount: await countPendingSuggestions(db, group.id),
      evidenceMessageIds: [],
    };
  }

  const nameByTgId = new Map(
    members.map((m) => [m.telegramUserId.toString(), m.displayName]),
  );
  // Ids the model references. Real Telegram ids pass through; manual members
  // carry huge synthetic NEGATIVE ids that JSON numbers can't round-trip (and
  // models won't reliably echo), which silently broke attributing a payer like
  // "Pomi paid for dinner" to a manually added Pomi. Those members get small
  // scan-scoped alias ids (-1, -2, ...) instead.
  const memberByPromptId = new Map<number, (typeof members)[number]>();
  const promptIdByMemberId = new Map<string, number>();
  let nextAlias = -1;
  for (const m of members) {
    const tid = m.telegramUserId;
    const usable = tid > 0n && tid <= BigInt(Number.MAX_SAFE_INTEGER);
    const promptId = usable ? Number(tid) : nextAlias--;
    memberByPromptId.set(promptId, m);
    promptIdByMemberId.set(m.id, promptId);
  }
  const memberByTgId = memberByPromptId;
  const allMemberIds = members.map((m) => m.id);

  // Read the persisted group-state summary (balances, open debts, recent items)
  // instead of recomputing the whole ledger here. Verify its stamp against the
  // live counts and self-heal if stale/missing — read-only when in sync.
  const summary = await getSummaryForScan(
    db,
    group.id,
    group.settings,
    await countLiveExpenses(db, group.id),
    await countSettlements(db, group.id),
  );

  const data: ScanData = {
    currency: group.defaultCurrency,
    members: members.map((m) => ({
      telegramUserId: promptIdByMemberId.get(m.id)!,
      displayName: m.displayName,
    })),
    recentExpenses: (summary?.recentExpenses ?? []).map((e) => ({
      description: e.desc,
      amount: e.amount,
      payerName: e.payer,
    })),
    openDebts: (summary?.openDebts ?? []).map((d) => ({
      fromName: d.from,
      toName: d.to,
      amount: d.amount,
    })),
    recentSettlements: (summary?.recentSettlements ?? []).map((s) => ({
      fromName: s.from,
      toName: s.to,
      amount: s.amount,
    })),
    messages: msgs.map((m) => ({
      telegramMessageId: Number(m.telegramMessageId),
      senderName: nameByTgId.get(m.senderTelegramUserId.toString()) ?? "Member",
      text: m.text,
      sentAt: m.sentAt,
    })),
  };

  const fromId = Number(msgs[0]!.telegramMessageId);
  const toId = Number(msgs[msgs.length - 1]!.telegramMessageId);
  const start = deps.now();

  let raw: unknown;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  try {
    const res = await gemini.suggest({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(data),
    });
    raw = res.json;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
  } catch (err) {
    console.error(
      `[scan] api_error:`,
      err instanceof Error ? err.message : err,
    );
    await createAiRun(db, {
      groupId: group.id,
      triggeredByMemberId,
      triggerType,
      fromMessageId: BigInt(fromId),
      toMessageId: BigInt(toId),
      durationMs: deps.now() - start,
      status: "api_error",
    });
    return {
      status: "api_error",
      written: 0,
      pendingCount: await countPendingSuggestions(db, group.id),
      evidenceMessageIds: [],
    };
  }

  const parsed = scanResponseSchema.safeParse(raw);
  const run = await createAiRun(db, {
    groupId: group.id,
    triggeredByMemberId,
    triggerType,
    fromMessageId: BigInt(fromId),
    toMessageId: BigInt(toId),
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    durationMs: deps.now() - start,
    status: parsed.success ? "success" : "parse_error",
    rawResponse: raw ?? null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues?.[0];
    console.log(
      `[scan] parse_error: ${issue?.message} at "${issue?.path?.join(".")}"`,
    );
    return {
      status: "parse_error",
      written: 0,
      pendingCount: await countPendingSuggestions(db, group.id),
      evidenceMessageIds: [],
    };
  }

  console.log(
    `[scan] gemini returned ${parsed.data.suggestions.length} suggestion(s)`,
  );

  // Code-level dedup: skip anything whose evidence overlaps a message already
  // handled by a prior suggestion (added / dismissed / pending). The prompt
  // hint alone isn't trustworthy.
  const handled = await handledEvidenceMessageIds(db, group.id);
  const isDuplicate = (evidence: number[]) =>
    evidence.some((id) => handled.has(id));

  // Map + threshold-filter into suggestion rows.
  const rows = [];
  let dropped = 0;
  let deduped = 0;
  for (const s of parsed.data.suggestions) {
    if (tierFor(s.confidence) === "drop") {
      dropped++;
      continue;
    }
    if (isDuplicate(s.evidence_message_ids)) {
      deduped++;
      continue;
    }

    // Payer + split members must be known group members.
    const payer =
      s.payer_telegram_id != null
        ? memberByTgId.get(s.payer_telegram_id)
        : undefined;
    if (s.payer_telegram_id != null && !payer) {
      dropped++;
      console.log(`[scan] drop "${s.description}": unknown payer ${s.payer_telegram_id}`);
      continue;
    }
    if (s.kind === "loan" && !payer) {
      dropped++;
      console.log(`[scan] drop "${s.description}": loan missing lender`);
      continue;
    }

    const splitMemberIds: string[] = [];
    let unknown = false;
    let sawUnknownSplit = false;
    for (const tid of s.split_with) {
      const m = memberByTgId.get(tid);
      if (!m) {
        console.log(`[scan] unknown split member for "${s.description}": ${tid}`);
        if (s.kind === "loan") {
          unknown = true;
          break;
        }
        sawUnknownSplit = true;
        continue;
      }
      splitMemberIds.push(m.id);
    }
    if (unknown) {
      dropped++;
      continue;
    }
    // "No participants named" — the chat didn't clue who shares the cost. This
    // is the empty split_with the prompt asks for, but also covers the model
    // still emitting just the payer (which is not an explicit participant list).
    // In that case default the split to the group's PRIMARY members only (its
    // regular participants), not everyone — falling back to all if none are
    // marked primary. Loans always name their borrower, so this never applies.
    const noParticipantsNamed =
      s.kind !== "loan" &&
      (splitMemberIds.length === 0 ||
        (splitMemberIds.length === 1 && payer != null && splitMemberIds[0] === payer.id));
    if (noParticipantsNamed) {
      const primaryIds = members.filter((m) => m.isPrimary).map((m) => m.id);
      splitMemberIds.length = 0;
      splitMemberIds.push(...(primaryIds.length ? primaryIds : allMemberIds));
      sawUnknownSplit = true;
      console.log(`[scan] fallback "${s.description}": split defaulted to primary members`);
    }
    if (
      s.kind === "loan" &&
      (splitMemberIds.length !== 1 || splitMemberIds[0] === payer?.id)
    ) {
      dropped++;
      console.log(`[scan] drop "${s.description}": invalid loan parties`);
      continue;
    }

    // Map shares keys (telegram ids as strings) → member ids.
    let shares: Record<string, number> | null = null;
    const normalizedSplitType =
      s.kind === "loan" ? "exact" : sawUnknownSplit ? "equal" : s.split_type;
    if (normalizedSplitType === "shares" && s.shares) {
      shares = {};
      let bad = false;
      for (const [tidStr, count] of Object.entries(s.shares)) {
        const m = memberByTgId.get(Number(tidStr));
        if (!m) {
          bad = true;
          break;
        }
        shares[m.id] = count;
      }
      if (bad) {
        dropped++;
        continue;
      }
    }

    rows.push({
      groupId: group.id,
      aiRunId: run.id,
      kind: s.kind,
      confidence: s.confidence.toFixed(2),
      description: capitalize(s.description),
      amount: centsToDecimal(decimalToCents(s.amount.toFixed(2))),
      payerMemberId: payer?.id ?? null,
      fromMemberId: null,
      toMemberId: null,
      splitType: normalizedSplitType,
      splitWith: splitMemberIds,
      shares: s.kind === "loan" ? null : shares,
      evidenceMessageIds: s.evidence_message_ids,
      reasoning: s.reasoning,
      status: "pending" as const,
    });
  }

  // Load live expenses + allocations once for settlement expense-matching.
  const liveExpenses = await listLiveExpenses(db, group.id);
  const rawAllocations = await listSettlementAllocations(db, group.id);
  const expensesForDebt: ExpenseForDebt[] = liveExpenses.map((e) => ({
    expenseId: e.expense.id,
    payerMemberId: e.expense.payerMemberId,
    occurredAt: e.expense.occurredAt,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: decimalToCents(s.shareAmount),
    })),
  }));
  const allocations: AllocationForDebt[] = rawAllocations.map((a) => ({
    expenseId: a.expenseId,
    memberId: a.memberId,
    allocatedCents: decimalToCents(a.allocatedAmount),
  }));

  // ── settlements (paybacks detected in chat) ──
  for (const st of parsed.data.settlements) {
    if (tierFor(st.confidence) === "drop") {
      dropped++;
      continue;
    }
    if (isDuplicate(st.evidence_message_ids)) {
      deduped++;
      continue;
    }
    const from = memberByTgId.get(st.from_telegram_id);
    const to = memberByTgId.get(st.to_telegram_id);
    if (!from || !to || from.id === to.id) {
      dropped++;
      console.log(
        `[scan] drop settlement: unknown member ${st.from_telegram_id}->${st.to_telegram_id}`,
      );
      continue;
    }

    // Match which expenses this payment covers using per-creditor debts.
    // Greedily pick oldest-first expenses where from owes to, up to the stated amount.
    const debts = deriveExpenseDebts(expensesForDebt, allocations)
      .filter((d) => d.debtorMemberId === from.id && d.creditorMemberId === to.id)
      .sort((a, b) => {
        const ea = liveExpenses.find((e) => e.expense.id === a.expenseId);
        const eb = liveExpenses.find((e) => e.expense.id === b.expenseId);
        return (ea?.expense.occurredAt.getTime() ?? 0) - (eb?.expense.occurredAt.getTime() ?? 0);
      });
    const matchedExpenseIds: string[] = [];
    if (st.amount != null) {
      let remaining = decimalToCents(st.amount.toFixed(2));
      for (const d of debts) {
        if (remaining <= 0) break;
        matchedExpenseIds.push(d.expenseId);
        remaining -= d.owedCents;
      }
    } else {
      matchedExpenseIds.push(...debts.map((d) => d.expenseId));
    }

    rows.push({
      groupId: group.id,
      aiRunId: run.id,
      kind: "settlement" as const,
      confidence: st.confidence.toFixed(2),
      description: `${from.displayName} → ${to.displayName}`,
      amount:
        st.amount != null
          ? centsToDecimal(decimalToCents(st.amount.toFixed(2)))
          : null,
      payerMemberId: null,
      fromMemberId: from.id,
      toMemberId: to.id,
      splitType: "equal" as const,
      splitWith: [],
      shares: null,
      expenseIds: matchedExpenseIds,
      evidenceMessageIds: st.evidence_message_ids,
      reasoning: st.reasoning,
      status: "pending" as const,
    });
  }

  const inserted = await insertSuggestions(db, rows);
  await setLastScanMessageId(db, group.id, BigInt(toId));
  console.log(
    `[scan] inserted ${inserted.length}, dropped ${dropped}, deduped ${deduped} (expenses=${parsed.data.suggestions.length} settlements=${parsed.data.settlements.length})`,
  );

  // The source messages behind the new suggestions, deduped, for badging.
  const evidenceMessageIds = [
    ...new Set(rows.flatMap((r) => r.evidenceMessageIds as number[])),
  ];

  return {
    status: "success",
    written: inserted.length,
    pendingCount: await countPendingSuggestions(db, group.id),
    evidenceMessageIds,
  };
}

/** Capitalize the first letter of an AI description (often returned lowercase). */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
