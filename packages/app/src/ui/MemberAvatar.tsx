/**
 * Avatar for a group member. Uses the Telegram photo only for the current
 * viewer (Telegram doesn't expose other members' photos to a Mini App); everyone
 * else gets the initial-letter avatar.
 */
import { Avatar } from "./primitives.js";
import { currentTelegramId, currentPhotoUrl } from "../telegram.js";

export function MemberAvatar({
  name,
  telegramUserId,
  size = 32,
}: {
  name: string;
  /** the member's telegram id (string), to match against the viewer */
  telegramUserId?: string | null;
  size?: number;
}) {
  const isMe =
    telegramUserId != null && telegramUserId === currentTelegramId();
  return (
    <Avatar
      name={name}
      size={size}
      photoUrl={isMe ? currentPhotoUrl() : undefined}
    />
  );
}
