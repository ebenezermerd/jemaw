/**
 * scanGroup — one Gemini scan of a group's recent chat (JEMAW_PLAN.md §6).
 * In-process, DB-backed. Never throws to the caller: failures are recorded in
 * ai_runs and surface nothing. Returns the count of suggestions written (for
 * the pinned-message badge).
 */
import type { Db } from "../db.js";
import type { GeminiClient } from "./geminiClient.js";
import { SYSTEM_PROMPT, buildUserPrompt, type ScanData } from "./prompt.js";
import { scanResponseSchema, tierFor } from "./scanSchema.js";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import {
  listMembers,
  lastNMessages,
  listLiveExpenses,
  createAiRun,
  insertSuggestions,
  setLastScanMessageId,
  countPendingSuggestions,
} from "../repo.js";
import type { Group } from "@jemaw/shared/schema";

const MAX_MESSAGES = 50;

export interface ScanDeps {
  db: Db;
  gemini: GeminiClient;
  now: () => number; // ms
}

export interface ScanResult {
  status: "success" | "parse_error" | "api_error" | "no_messages";
  written: number;
  pendingCount: number;
}

export async function scanGroup(
  deps: ScanDeps,
  group: Group,
  triggeredByMemberId: string | null,
  triggerType: "keyword" | "command" | "manual",
): Promise<ScanResult> {
  const { db, gemini } = deps;
  const members = await listMembers(db, group.id);
  // Trailing window of the last N messages, so every "jemaw" re-examines recent
  // context (a since-last-scan window of one message finds nothing).
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
    };
  }

  const nameByTgId = new Map(
    members.map((m) => [m.telegramUserId.toString(), m.displayName]),
  );
  const memberByTgId = new Map(
    members.map((m) => [Number(m.telegramUserId), m]),
  );

  const liveExpenses = await listLiveExpenses(db, group.id);
  const recentExpenses = liveExpenses.slice(0, 5).map((e) => ({
    description: e.expense.description,
    amount: e.expense.amount,
    payerName:
      members.find((m) => m.id === e.expense.payerMemberId)?.displayName ??
      "Member",
  }));

  const data: ScanData = {
    currency: group.defaultCurrency,
    members: members.map((m) => ({
      telegramUserId: Number(m.telegramUserId),
      displayName: m.displayName,
    })),
    recentExpenses,
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
  } catch {
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
    console.log(`[scan] parse_error:`, parsed.error.issues?.[0]?.message);
    return {
      status: "parse_error",
      written: 0,
      pendingCount: await countPendingSuggestions(db, group.id),
    };
  }

  console.log(
    `[scan] gemini returned ${parsed.data.suggestions.length} suggestion(s)`,
  );

  // Map + threshold-filter into suggestion rows.
  const rows = [];
  let dropped = 0;
  for (const s of parsed.data.suggestions) {
    if (tierFor(s.confidence) === "drop") {
      dropped++;
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

    const splitMemberIds: string[] = [];
    let unknown = false;
    for (const tid of s.split_with) {
      const m = memberByTgId.get(tid);
      if (!m) {
        unknown = true;
        console.log(`[scan] drop "${s.description}": unknown split member ${tid}`);
        break;
      }
      splitMemberIds.push(m.id);
    }
    if (unknown || splitMemberIds.length === 0) {
      dropped++;
      continue;
    }

    // Map shares keys (telegram ids as strings) → member ids.
    let shares: Record<string, number> | null = null;
    if (s.split_type === "shares" && s.shares) {
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
      confidence: s.confidence.toFixed(2),
      description: s.description,
      amount: centsToDecimal(decimalToCents(s.amount.toFixed(2))),
      payerMemberId: payer?.id ?? null,
      splitType: s.split_type,
      splitWith: splitMemberIds,
      shares,
      evidenceMessageIds: s.evidence_message_ids,
      reasoning: s.reasoning,
      status: "pending" as const,
    });
  }

  const inserted = await insertSuggestions(db, rows);
  await setLastScanMessageId(db, group.id, BigInt(toId));
  console.log(
    `[scan] inserted ${inserted.length}, dropped ${dropped} (of ${parsed.data.suggestions.length})`,
  );

  return {
    status: "success",
    written: inserted.length,
    pendingCount: await countPendingSuggestions(db, group.id),
  };
}
