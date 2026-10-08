/**
 * Admin-console switches (app_config bot.* keys) with a short cache, plus the
 * heartbeat the console uses to show the bot is alive. Reads never throw: a
 * failed refresh keeps the last good values (or the defaults).
 */
import { inArray, sql } from "drizzle-orm";
import { appConfig } from "@jemaw/shared/schema";
import {
  BOT_HEARTBEAT_KEY,
  BOT_RUNTIME_KEYS,
  DEFAULT_BOT_RUNTIME_CONFIG,
  runtimeConfigFromRows,
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
