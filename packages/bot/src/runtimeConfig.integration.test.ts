/**
 * Runtime config store + heartbeat against the local Postgres. Skips without
 * DATABASE_URL. Cleans up the keys it writes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { appConfig } from "@jemaw/shared/schema";
import { BOT_HEARTBEAT_KEY, BOT_RUNTIME_KEYS } from "@jemaw/shared/runtimeConfig";
import { createDb, type Db } from "./db.js";
import { createRuntimeConfigStore, startHeartbeat } from "./runtimeConfig.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;
const keys = [...Object.values(BOT_RUNTIME_KEYS), BOT_HEARTBEAT_KEY];

d("runtime config store", () => {
  let db: Db;
  beforeAll(async () => {
    db = createDb({ databaseUrl: DATABASE_URL! });
    await db.delete(appConfig).where(inArray(appConfig.key, keys));
  });
  afterAll(async () => {
    await db.delete(appConfig).where(inArray(appConfig.key, keys));
  });

  it("starts from the defaults and picks up admin switches on refresh", async () => {
    const store = createRuntimeConfigStore(db);
    await store.refresh();
    expect(store.current().scanEnabled).toBe(true);
    await db.insert(appConfig).values([
      { key: BOT_RUNTIME_KEYS.scanEnabled, value: false },
      { key: BOT_RUNTIME_KEYS.maintenanceMessage, value: "Back soon" },
    ]);
    await store.refresh();
    expect(store.current().scanEnabled).toBe(false);
    expect(store.current().maintenanceMessage).toBe("Back soon");
  });

  it("writes and refreshes the heartbeat", async () => {
    const stop = startHeartbeat(db, "abc1234", 60_000);
    await new Promise((r) => setTimeout(r, 200));
    stop();
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, BOT_HEARTBEAT_KEY));
    expect(row?.value).toMatchObject({ version: "abc1234" });
  });
});
