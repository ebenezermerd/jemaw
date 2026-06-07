/**
 * Member sync (JEMAW_PLAN.md §13.1, adjusted for Telegram API limits).
 * Bots cannot enumerate a group's full membership, so we register members:
 *   - see-as-they-speak (any sender we observe)
 *   - the installer at /start
 *   - administrators (getChatAdministrators) when available
 *   - manual add via Settings (handled in the members route)
 */
import type { Api } from "grammy";
import type { Db } from "../db.js";
import { upsertMember, syncMemberRoles } from "../repo.js";

function displayNameOf(u: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.username || "Member";
}

/** Register a single Telegram user as a member (idempotent). */
export async function registerUser(
  db: Db,
  groupId: string,
  user: {
    id: number | bigint;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  },
): Promise<void> {
  if (user.is_bot) return;
  await upsertMember(
    db,
    groupId,
    BigInt(user.id),
    displayNameOf(user),
    user.username ?? null,
  );
}

/**
 * Seed members from the chat's administrators and sync their roles: every human
 * admin Telegram returns becomes a Jemaw `admin`, everyone else a `member`.
 * Returns true when the admin list was read successfully (so callers can apply a
 * fallback when it wasn't). Best-effort: never throws.
 */
export async function seedAdmins(
  api: Api,
  db: Db,
  groupId: string,
  telegramChatId: bigint,
): Promise<boolean> {
  try {
    const admins = await api.getChatAdministrators(Number(telegramChatId));
    const adminTgIds: bigint[] = [];
    for (const a of admins) {
      if (a.user.is_bot) continue; // bots never get a role
      await registerUser(db, groupId, a.user);
      adminTgIds.push(BigInt(a.user.id));
    }
    await syncMemberRoles(db, groupId, adminTgIds);
    return adminTgIds.length > 0;
  } catch {
    // Private chats / insufficient rights — caller applies a fallback.
    return false;
  }
}
