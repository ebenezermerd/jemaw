/**
 * Bot-wide switches the admin console writes to app_config and the bot reads
 * (cached) at runtime. Each key maps to one row; a missing row means the
 * default below, which matches the bot's behaviour before these existed.
 */
export interface BotRuntimeConfig {
  /** AI expense scans everywhere. */
  scanEnabled: boolean;
  /** Humor and ledger chat replies everywhere. */
  chatEnabled: boolean;
  /** Overrides the env model for scans and chat; null keeps the env value. */
  model: string | null;
  /** Minimum gap between scans in one group. */
  scanCooldownSeconds: number;
  weeklyDigestEnabled: boolean;
  /** When set, commands answer with this instead of running. */
  maintenanceMessage: string | null;
}

export const DEFAULT_BOT_RUNTIME_CONFIG: BotRuntimeConfig = {
  scanEnabled: true,
  chatEnabled: true,
  model: null,
  scanCooldownSeconds: 10,
  weeklyDigestEnabled: true,
  maintenanceMessage: null,
};

/** app_config key for each field. */
export const BOT_RUNTIME_KEYS: Record<keyof BotRuntimeConfig, string> = {
  scanEnabled: "bot.ai.scanEnabled",
  chatEnabled: "bot.ai.chatEnabled",
  model: "bot.ai.model",
  scanCooldownSeconds: "bot.ai.scanCooldownSeconds",
  weeklyDigestEnabled: "bot.weeklyDigest.enabled",
  maintenanceMessage: "bot.maintenanceMessage",
};

/** app_config key the bot refreshes so the console can tell it is alive. */
export const BOT_HEARTBEAT_KEY = "bot.heartbeat";

export interface BotHeartbeat {
  at: string; // ISO
  version: string | null;
}

const nonEmpty = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

/** Coerce one stored value, falling back to the default when it is off-type. */
export function parseRuntimeValue<K extends keyof BotRuntimeConfig>(
  key: K,
  raw: unknown,
): BotRuntimeConfig[K] {
  const d = DEFAULT_BOT_RUNTIME_CONFIG[key];
  switch (key) {
    case "model":
    case "maintenanceMessage":
      return nonEmpty(raw) as BotRuntimeConfig[K];
    case "scanCooldownSeconds": {
      const n = Number(raw);
      return (Number.isFinite(n) && raw !== null ? Math.min(600, Math.max(5, Math.round(n))) : d) as BotRuntimeConfig[K];
    }
    default:
      return (typeof raw === "boolean" ? raw : d) as BotRuntimeConfig[K];
  }
}

/** Build the config from app_config rows ({key, value}). */
export function runtimeConfigFromRows(rows: { key: string; value: unknown }[]): BotRuntimeConfig {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_BOT_RUNTIME_CONFIG };
  for (const field of Object.keys(BOT_RUNTIME_KEYS) as (keyof BotRuntimeConfig)[]) {
    const k = BOT_RUNTIME_KEYS[field];
    if (byKey.has(k)) (out as Record<string, unknown>)[field] = parseRuntimeValue(field, byKey.get(k));
  }
  return out;
}
