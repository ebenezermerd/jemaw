/**
 * Avatar for a group member: their Telegram profile photo (proxied by the API,
 * see shared/avatar), or the viewer's own photo from Telegram, falling back to
 * the initial-letter avatar. Pass a member id or Telegram id; the photo link
 * comes from the cached group.
 */
import { Avatar } from "./primitives.js";
import { currentTelegramId, currentPhotoUrl } from "../telegram.js";
import { useGroup } from "../lib/hooks.js";
import { apiUrl } from "../lib/api.js";

export function MemberAvatar({
  name,
  telegramUserId,
  memberId,
  size = 32,
}: {
  name: string;
  /** the member's telegram id (string) */
  telegramUserId?: string | null;
  /** or the member id, when the telegram id isn't at hand */
  memberId?: string | null;
  size?: number;
}) {
  const group = useGroup();
  const member = group.data?.members.find((m) =>
    memberId ? m.id === memberId : telegramUserId != null && m.telegramUserId === telegramUserId,
  );
  const tg = telegramUserId ?? member?.telegramUserId;
  const isMe = tg != null && tg === currentTelegramId();
  const photo = (isMe ? currentPhotoUrl() : undefined) ?? (member?.photoUrl ? apiUrl(member.photoUrl) : undefined);
  return <Avatar name={name} size={size} photoUrl={photo} />;
}
