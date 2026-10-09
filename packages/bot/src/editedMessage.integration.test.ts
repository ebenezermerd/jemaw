/**
 * captureEditedMessage against the local Postgres. Skips if no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { groups, messages } from "@jemaw/shared/schema";
import { createDb, type Db } from "./db.js";
import { captureEditedMessage, captureMessage, upsertGroup } from "./repo.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("captureEditedMessage", () => {
  let db: Db;
  let groupId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const chat = BigInt(-5_000_000_000 - Math.floor(process.uptime() * 1000));
    groupId = (await upsertGroup(db, chat, "EditTrip", "ETB")).id;
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  });

  it("returns the old text and stores the edit", async () => {
    await captureMessage(db, groupId, 7n, 42n, "how much does aman owe", new Date());
    expect(await captureEditedMessage(db, groupId, 7n, 42n, "how much does aman owe jemaw", new Date())).toBe(
      "how much does aman owe",
    );
    const [row] = await db.select().from(messages).where(eq(messages.groupId, groupId));
    expect(row?.text).toBe("how much does aman owe jemaw");
  });

  it("returns null for a message it never saw, and stores it", async () => {
    expect(await captureEditedMessage(db, groupId, 8n, 42n, "hi jemaw", new Date())).toBeNull();
    const rows = await db.select().from(messages).where(eq(messages.groupId, groupId));
    expect(rows.map((r) => r.text)).toContain("hi jemaw");
  });
});
