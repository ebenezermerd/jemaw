/**
 * Row → wire DTO mappers. Telegram ids become strings; cents become decimal
 * strings; user status is derived from activity recency + active flag.
 */
import {
  centsToDecimal,
  type AdminUserDto,
  type AdminGroupDto,
  type AdminAuditEntryDto,
  type AnnouncementDto,
  type AdminTopGroupDto,
  type AdminExpenseDto,
} from "@jemaw/shared/types";
import type { AdminAuditLog, Announcement } from "@jemaw/shared/schema";
import type {
  AdminUserRow,
  AdminGroupRow,
  TopGroupRow,
  AdminExpenseRow,
} from "./repo.js";

const IDLE_AFTER_DAYS = 14;
const NEW_WITHIN_DAYS = 7;

export function deriveUserStatus(
  row: AdminUserRow,
  now: number,
): AdminUserDto["status"] {
  if (!row.isActive) return "suspended";
  if (!row.lastActiveAt) return "new";
  const ageDays = (now - row.lastActiveAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= NEW_WITHIN_DAYS) return "active";
  if (ageDays <= IDLE_AFTER_DAYS) return "active";
  return "idle";
}

export function toUserDto(row: AdminUserRow, now: number): AdminUserDto {
  return {
    telegramUserId: row.telegramUserId.toString(),
    displayName: row.displayName,
    username: row.username,
    groupCount: row.groupCount,
    isActive: row.isActive,
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    status: deriveUserStatus(row, now),
  };
}

export function toGroupDto(row: AdminGroupRow): AdminGroupDto {
  return {
    id: row.id,
    name: row.name,
    defaultCurrency: row.defaultCurrency,
    memberCount: row.memberCount,
    volume: centsToDecimal(row.volumeCents),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTopGroupDto(row: TopGroupRow): AdminTopGroupDto {
  return { id: row.id, name: row.name, volume: centsToDecimal(row.volumeCents) };
}

export function toExpenseDto(row: AdminExpenseRow): AdminExpenseDto {
  return {
    id: row.id,
    description: row.description,
    amount: centsToDecimal(row.amountCents),
    currency: row.currency,
    kind: row.kind,
    source: row.source,
    groupName: row.groupName,
    payerName: row.payerName,
    occurredAt: row.occurredAt.toISOString(),
    voided: row.voided,
  };
}

export function toAuditDto(row: AdminAuditLog): AdminAuditEntryDto {
  return {
    id: row.id,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: (row.detail as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAnnouncementDto(row: Announcement): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    targetId: row.targetId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    stats: (row.stats as Record<string, unknown>) ?? {},
  };
}
