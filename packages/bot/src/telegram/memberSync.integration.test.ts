/**
 * registerUser keeps a member's @username current without touching their
 * name or identity. Local Postgres; skips without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { groups, members } from "@jemaw/shared/schema";
import { createDb, type Db } from "../db.js";
import { upsertGroup } from "../repo.js";
import { registerUser } from "./memberSync.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("registerUser", () => {
  let db: Db;
  let groupId: string;
  const tg = 9_200_000_000 + Math.floor(Math.random() * 1e6);

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    groupId = (await upsertGroup(db, BigInt(-5_000_000_000 - Math.floor(Math.random() * 1e6)), "UsernameGroup", "ETB")).id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  });

  it("follows a changed or removed @username and keeps the same member and name", async () => {
    await registerUser(db, groupId, { id: tg, first_name: "Hana", username: "hana_1" });
    const [first] = await db.select().from(members).where(eq(members.groupId, groupId));
    // An admin renamed her in the app; that must survive.
    await db.update(members).set({ displayName: "Hana B." }).where(eq(members.id, first!.id));

    await registerUser(db, groupId, { id: tg, first_name: "Hana", username: "hana_new" });
    let rows = await db.select().from(members).where(eq(members.groupId, groupId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first!.id, username: "hana_new", displayName: "Hana B." });

    await registerUser(db, groupId, { id: tg, first_name: "Hana" });
    rows = await db.select().from(members).where(eq(members.groupId, groupId));
    expect(rows[0]).toMatchObject({ id: first!.id, username: null });
  });
});
