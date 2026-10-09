import { DEFAULT_POST_DESIGNS, parsePostDesigns, type PostDesigns } from "./posts/designs.js";
import { DEFAULT_BOSS_CONFIG, parseBossConfig, type BossConfig } from "./boss.js";

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
  /** Layout per kind of post (weekly report, AI answers, announcements). */
  postDesigns: PostDesigns;
  /** How the bot treats Jemaw's super admins in group chats. */
  boss: BossConfig;
}

export const DEFAULT_BOT_RUNTIME_CONFIG: BotRuntimeConfig = {
  scanEnabled: true,
  chatEnabled: true,
  model: null,
  scanCooldownSeconds: 10,
  weeklyDigestEnabled: true,
  maintenanceMessage: null,
  postDesigns: DEFAULT_POST_DESIGNS,
  boss: DEFAULT_BOSS_CONFIG,
};

/** app_config key for each field. */
export const BOT_RUNTIME_KEYS: Record<keyof BotRuntimeConfig, string> = {
  scanEnabled: "bot.ai.scanEnabled",
  chatEnabled: "bot.ai.chatEnabled",
  model: "bot.ai.model",
  scanCooldownSeconds: "bot.ai.scanCooldownSeconds",
  weeklyDigestEnabled: "bot.weeklyDigest.enabled",
  maintenanceMessage: "bot.maintenanceMessage",
  postDesigns: "bot.postDesigns",
  boss: "bot.boss",
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
    case "postDesigns":
      return parsePostDesigns(raw) as BotRuntimeConfig[K];
    case "boss":
      return parseBossConfig(raw) as BotRuntimeConfig[K];
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

// ─── AI provider limits ────────────────────────────────────────────────
/** app_config key holding the latest Groq rate-limit snapshot. */
export const BOT_AI_LIMITS_KEY = "bot.ai.limits";

export interface RateWindow {
  limit: number;
  remaining: number;
  /** seconds until the window refills, when Groq says */
  resetSeconds: number | null;
}

/**
 * What Groq reported on its last reply. `requests` is the per-day request
 * budget; `tokens` is the per-minute token budget.
 */
export interface AiLimitsSnapshot {
  at: string; // ISO
  provider: "groq";
  model: string;
  source: "bot" | "check";
  requests: RateWindow | null;
  tokens: RateWindow | null;
}

/** Groq writes resets like "2m59.56s", "7.66s" or "120ms". */
export function parseResetSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let total = 0;
  let matched = false;
  for (const m of raw.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : m[2] === "s" ? n : n / 1000;
  }
  return matched ? Math.round(total * 10) / 10 : null;
}

/** Build a snapshot from Groq's x-ratelimit-* response headers. Null when absent. */
export function limitsFromHeaders(
  get: (name: string) => string | null,
  meta: { model: string; source: AiLimitsSnapshot["source"]; now: Date },
): AiLimitsSnapshot | null {
  const window = (kind: "requests" | "tokens"): RateWindow | null => {
    const limit = Number(get(`x-ratelimit-limit-${kind}`));
    const remaining = Number(get(`x-ratelimit-remaining-${kind}`));
    if (!get(`x-ratelimit-limit-${kind}`) || !Number.isFinite(limit) || !Number.isFinite(remaining)) return null;
    return { limit, remaining, resetSeconds: parseResetSeconds(get(`x-ratelimit-reset-${kind}`)) };
  };
  const requests = window("requests");
  const tokens = window("tokens");
  if (!requests && !tokens) return null;
  return { at: meta.now.toISOString(), provider: "groq", model: meta.model, source: meta.source, requests, tokens };
}
