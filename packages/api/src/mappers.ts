/**
 * Row → wire DTO mappers. Telegram ids become strings; cents become decimal
 * strings; user status is derived from activity recency + active flag.
 */
import { avatarPath } from "@jemaw/shared/avatar";
import {
  centsToDecimal,
  type AdminUserDto,
  type AdminAuditEntryDto,
  type AnnouncementDto,
  type AdminTopGroupDto,
} from "@jemaw/shared/types";
import type { AdminAuditLog, Announcement } from "@jemaw/shared/schema";
import type {
  AdminUserRow,
  TopGroupRow,
} from "./repo.js";

const IDLE_AFTER_DAYS = 14;
const NEW_WITHIN_DAYS = 7;

export function deriveUserStatus(
  row: AdminUserRow,
  now: number,
): AdminUserDto["status"] {
  if (!row.isActive) return "suspended";
  const days = (t: Date) => (now - t.getTime()) / (24 * 60 * 60 * 1000);
  if (row.lastActiveAt && days(row.lastActiveAt) <= IDLE_AFTER_DAYS) return "active";
  // Joined lately and not active yet: new. Otherwise they have gone quiet.
  if (days(row.joinedAt) <= NEW_WITHIN_DAYS) return "new";
  return "idle";
}

// Signs profile photo links; set once by registerApi with the bot token.
let avatarToken: string | undefined;
export function configureAvatars(botToken: string | undefined): void {
  avatarToken = botToken;
}
export const memberPhoto = (telegramUserId: bigint | string) => avatarPath(avatarToken, telegramUserId);

export function toUserDto(row: AdminUserRow, now: number): AdminUserDto {
  return {
    photoUrl: memberPhoto(row.telegramUserId),
    telegramUserId: row.telegramUserId.toString(),
    displayName: row.displayName,
    username: row.username,
    groupCount: row.groupCount,
    isActive: row.isActive,
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    status: deriveUserStatus(row, now),
    isManual: row.telegramUserId < 0n,
  };
}

export function toTopGroupDto(row: TopGroupRow): AdminTopGroupDto {
  return { id: row.id, name: row.name, volume: centsToDecimal(row.volumeCents) };
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
