/**
 * Row -> DTO mappers. Centralizes the wire-format conventions (string ids,
 * decimal-string money, ISO timestamps).
 */
import type { Member, Group, Settlement } from "@jemaw/shared/schema";
import type {
  MemberDto,
  GroupDto,
  ExpenseDto,
  BalanceDto,
  SettlementDto,
  TransferDto,
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
    isActive: m.isActive,
  };
}

export function toGroupDto(
  g: Group,
  members: Member[],
  hasExpenses: boolean,
): GroupDto {
  return {
    id: g.id,
    name: g.name,
    defaultCurrency: g.defaultCurrency,
    members: members.map(toMemberDto),
    hasExpenses,
  };
}

export function toExpenseDto(e: ExpenseWithShares): ExpenseDto {
  return {
    id: e.expense.id,
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
    markedPaidAt: s.markedPaidAt ? s.markedPaidAt.toISOString() : null,
    markedPaidByMemberId: s.markedPaidByMemberId,
    createdAt: s.createdAt.toISOString(),
  };
}
