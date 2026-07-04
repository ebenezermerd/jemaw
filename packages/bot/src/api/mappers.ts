/**
 * Row -> DTO mappers. Centralizes the wire-format conventions (string ids,
 * decimal-string money, ISO timestamps).
 */
import type {
  Member,
  Group,
  Settlement,
  Suggestion,
} from "@jemaw/shared/schema";
import type {
  MemberDto,
  GroupDto,
  ExpenseDto,
  BalanceDto,
  SettlementDto,
  TransferDto,
  SuggestionDto,
} from "@jemaw/shared/types";
import { centsToDecimal, telegramIdToString } from "@jemaw/shared/types";
import type { ExpenseWithShares } from "../repo.js";
import type { MemberNet } from "../domain/balances.js";
import type { Transfer } from "../domain/settle.js";

export function toMemberDto(m: Member): MemberDto {
  return {
    id: m.id,
    displayName: m.displayName,
    username: m.username,
    telegramUserId: telegramIdToString(m.telegramUserId),
    telegramLinked: m.telegramUserId > 0n,
    role: m.role,
    isActive: m.isActive,
    isPrimary: m.isPrimary,
  };
}

export function toGroupDto(
  g: Group,
  members: Member[],
  hasExpenses: boolean,
  canScan: boolean,
  /** the calling member, to expose their own admin flag */
  caller: Member,
): GroupDto {
  return {
    id: g.id,
    name: g.name,
    defaultCurrency: g.defaultCurrency,
    members: members.map(toMemberDto),
    hasExpenses,
    canScan,
    isAdmin: caller.role === "admin",
  };
}

export function toExpenseDto(e: ExpenseWithShares): ExpenseDto {
  return {
    id: e.expense.id,
    kind: e.expense.kind,
    description: e.expense.description,
    amount: e.expense.amount, // already numeric string from pg
    currency: e.expense.currency,
    payerMemberId: e.expense.payerMemberId,
    createdByMemberId: e.expense.createdByMemberId,
    source: e.expense.source,
    occurredAt: e.expense.occurredAt.toISOString(),
    createdAt: e.expense.createdAt.toISOString(),
    voidedAt: e.expense.voidedAt ? e.expense.voidedAt.toISOString() : null,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareAmount: s.shareAmount,
    })),
  };
}

export function toBalanceDtos(
  nets: MemberNet[],
  nameOf: (memberId: string) => string,
): BalanceDto[] {
  return nets
    .map((n) => ({
      memberId: n.memberId,
      displayName: nameOf(n.memberId),
      net: centsToDecimal(n.netCents),
    }))
    .sort((a, b) => Number(b.net) - Number(a.net));
}

export function toTransferDto(t: Transfer): TransferDto {
  return {
    fromMemberId: t.fromMemberId,
    toMemberId: t.toMemberId,
    amount: centsToDecimal(t.amountCents),
  };
}

export function toSettlementDto(s: Settlement): SettlementDto {
  return {
    id: s.id,
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amount: s.amount,
    currency: s.currency,
    method: s.method,
    description: s.description,
    expenseIds: (s.expenseIds as string[] | null) ?? null,
    occurredAt: s.occurredAt ? s.occurredAt.toISOString() : null,
    markedPaidAt: s.markedPaidAt ? s.markedPaidAt.toISOString() : null,
    markedPaidByMemberId: s.markedPaidByMemberId,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toSuggestionDto(s: Suggestion): SuggestionDto {
  const confidence = Number(s.confidence);
  return {
    id: s.id,
    kind: s.kind,
    amount: s.amount,
    description: s.description,
    payerMemberId: s.payerMemberId,
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    splitType: s.splitType,
    splitWith: (s.splitWith as string[]) ?? [],
    shares: (s.shares as Record<string, number> | null) ?? null,
    expenseIds: (s.expenseIds as string[] | null) ?? [],
    evidenceMessageIds: (s.evidenceMessageIds as number[]) ?? [],
    reasoning: s.reasoning,
    confidence: s.confidence,
    tier: confidence >= 0.7 ? "normal" : "low",
  };
}
