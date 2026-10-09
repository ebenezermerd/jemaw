/**
 * Admin-console switches (app_config bot.* keys) with a short cache, plus the
 * heartbeat the console uses to show the bot is alive. Reads never throw: a
 * failed refresh keeps the last good values (or the defaults).
 */
import { inArray, sql } from "drizzle-orm";
import { appConfig } from "@jemaw/shared/schema";
import {
  BOT_AI_LIMITS_KEY,
  BOT_HEARTBEAT_KEY,
  BOT_RUNTIME_KEYS,
  DEFAULT_BOT_RUNTIME_CONFIG,
  runtimeConfigFromRows,
  type AiLimitsSnapshot,
  type BotRuntimeConfig,
} from "@jemaw/shared/runtimeConfig";
import type { Db } from "./db.js";

export interface RuntimeConfigStore {
  /** Last loaded values; synchronous so hot paths can read it freely. */
  current(): BotRuntimeConfig;
  refresh(): Promise<void>;
}

/** Fixed values, for tests and for callers without a database. */
export function staticRuntimeConfig(
  overrides: Partial<BotRuntimeConfig> = {},
): RuntimeConfigStore {
  const value = { ...DEFAULT_BOT_RUNTIME_CONFIG, ...overrides };
  return { current: () => value, refresh: async () => {} };
}

export function createRuntimeConfigStore(db: Db, ttlMs = 60_000): RuntimeConfigStore {
  let value = { ...DEFAULT_BOT_RUNTIME_CONFIG };
  let loadedAt = 0;
  let inflight: Promise<void> | null = null;
  const refresh = () =>
    (inflight ??= db
      .select({ key: appConfig.key, value: appConfig.value })
      .from(appConfig)
      .where(inArray(appConfig.key, Object.values(BOT_RUNTIME_KEYS)))
      .then((rows) => {
        value = runtimeConfigFromRows(rows);
        loadedAt = Date.now();
      })
      .catch((err) =>
        console.warn(`[config] refresh failed:`, err instanceof Error ? err.message : err),
      )
      .finally(() => {
        inflight = null;
      }));
  return {
    current() {
      if (Date.now() - loadedAt > ttlMs) void refresh();
      return value;
    },
    refresh,
  };
}

async function upsert(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, updatedByUid: "bot" })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: sql`excluded.value`, updatedAt: new Date(), updatedByUid: "bot" },
    });
}

/**
 * Save Groq's latest remaining-limit numbers for the console. Writes at most
 * once per `minIntervalMs`; the newest snapshot in between wins.
 */
export function createLimitsRecorder(db: Db, minIntervalMs = 15_000): (s: AiLimitsSnapshot) => void {
  let latest: AiLimitsSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWrite = 0;
  const flush = () => {
    timer = null;
    if (!latest) return;
    const snap = latest;
    latest = null;
    lastWrite = Date.now();
    void upsert(db, BOT_AI_LIMITS_KEY, snap).catch((err) =>
      console.warn(`[limits] save failed:`, err instanceof Error ? err.message : err),
    );
  };
  return (snap) => {
    latest = snap;
    if (timer) return;
    const wait = Math.max(0, lastWrite + minIntervalMs - Date.now());
    timer = setTimeout(flush, wait);
    timer.unref?.();
  };
}

/** Upsert the heartbeat now and every `intervalMs`. Returns a stop function. */
export function startHeartbeat(db: Db, version: string | null, intervalMs = 5 * 60_000): () => void {
  const beat = () =>
    db
      .insert(appConfig)
      .values({ key: BOT_HEARTBEAT_KEY, value: { at: new Date().toISOString(), version }, updatedByUid: "bot" })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value: sql`excluded.value`, updatedAt: new Date(), updatedByUid: "bot" },
      })
      .catch((err) =>
        console.warn(`[heartbeat] failed:`, err instanceof Error ? err.message : err),
      );
  void beat();
  const timer = setInterval(beat, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
