/**
 * Boss mode: how the bot treats Jemaw's super admins in group chats. The
 * console links their Telegram accounts; the bot recognises them by
 * Telegram id, which a display name can't fake.
 */

export const BOSS_TONES = ["respect", "gentle", "normal"] as const;
export type BossTone = (typeof BOSS_TONES)[number];

export interface BossPerson {
  /** Telegram user id as a decimal string. */
  telegramUserId: string;
  name: string;
}

export interface BossConfig {
  people: BossPerson[];
  /** respect = warm and loyal, never roasted; gentle = light teasing only; normal = like anyone. */
  tone: BossTone;
  /** Their mentions never count toward the pause, and they get answers while Jemaw is quiet. */
  skipPause: boolean;
  /** "jemaw enough", "unpause" or an apology from them ends a pause at once. */
  canEndPause: boolean;
  /** "jemaw humor off" and "jemaw humor on" from them switch the group's humor. */
  commands: boolean;
  /** Settle, approve or dismiss drafts, add and delete from chat, behind a Confirm button. */
  actions: boolean;
}

export const DEFAULT_BOSS_CONFIG: BossConfig = {
  people: [],
  tone: "respect",
  skipPause: true,
  canEndPause: true,
  commands: true,
  actions: true,
};

export const BOSS_TONE_META: Record<BossTone, { label: string; hint: string }> = {
  respect: { label: "Respect", hint: "Warm and loyal. Never roasted or made fun of." },
  gentle: { label: "Gentle", hint: "Light, friendly teasing only. No hard roasts." },
  normal: { label: "Like everyone", hint: "Same humor as the rest of the group." },
};

const MAX_PEOPLE = 10;

/** Coerce a stored value, filling anything missing or off-type from the default. */
export function parseBossConfig(raw: unknown): BossConfig {
  const d = DEFAULT_BOSS_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d, people: [] };
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const people: BossPerson[] = [];
  for (const p of Array.isArray(r.people) ? r.people : []) {
    if (!p || typeof p !== "object") continue;
    const id = String((p as Record<string, unknown>).telegramUserId ?? "").trim();
    if (!/^-?\d{1,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const name = String((p as Record<string, unknown>).name ?? "").trim().slice(0, 80) || id;
    people.push({ telegramUserId: id, name });
    if (people.length >= MAX_PEOPLE) break;
  }
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    people,
    tone: (BOSS_TONES as readonly string[]).includes(r.tone as string) ? (r.tone as BossTone) : d.tone,
    skipPause: bool(r.skipPause, d.skipPause),
    canEndPause: bool(r.canEndPause, d.canEndPause),
    commands: bool(r.commands, d.commands),
    actions: bool(r.actions, d.actions),
  };
}

/** Whether a Telegram user is one of the bosses. */
export function isBoss(config: BossConfig, telegramUserId: bigint | number | string | null | undefined): boolean {
  if (telegramUserId == null) return false;
  const id = String(telegramUserId);
  return config.people.some((p) => p.telegramUserId === id);
}
