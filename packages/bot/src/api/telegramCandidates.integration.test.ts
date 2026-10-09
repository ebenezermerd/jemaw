/**
 * The account picker lists everyone the bot has seen in this group: linked
 * members, message senders, joiners and chat admins. Local Postgres; skips
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { groups, members, messages } from "@jemaw/shared/schema";
import type { TelegramCandidatesResponse } from "@jemaw/shared/types";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { captureMessage, rememberSeenUser, setMemberRole, upsertGroup, upsertMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:CANDIDATES";
const NOW = 1_780_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("telegram candidates", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  const base = 9_300_000_000 + Math.floor(Math.random() * 1e6);
  const admin = base + 1;
  const sender = base + 2;
  const joiner = base + 3;
  const chatAdmin = base + 4;

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    groupId = (await upsertGroup(db, BigInt(-6_000_000_000 - Math.floor(Math.random() * 1e6)), "PickerGroup", "ETB")).id;
    await upsertMember(db, groupId, BigInt(admin), "Ada", "ada");
    await setMemberRole(db, groupId, BigInt(admin), "admin");
    await captureMessage(db, groupId, 1n, BigInt(sender), "hi", new Date());
    await rememberSeenUser(db, groupId, { id: joiner, first_name: "Jo", username: "jo_joined" });
    app = await buildServer({
      api: {
        db,
        botToken: BOT_TOKEN,
        now: () => NOW,
        scanLimiter: { tryAcquire: () => true } as never,
        botApi: {
          getChatAdministrators: async () => [
            { user: { id: chatAdmin, is_bot: false, first_name: "Cat", username: "cat_admin" } },
            { user: { id: 1, is_bot: true, first_name: "Jemaw" } },
          ],
          getChatMember: async (_c: number, id: number) => ({ user: { id, first_name: "Sam", username: "sam_says" } }),
        } as never,
      },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    await db.delete(messages).where(eq(messages.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  });

  it("lists senders, joiners who never spoke and chat admins, without bots", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/members/telegram-candidates`,
      headers: {
        "x-telegram-init-data": signInitDataForTest(
          { auth_date: String(NOW - 5), user: JSON.stringify({ id: admin, first_name: "Ada" }) },
          BOT_TOKEN,
        ),
      },
    });
    expect(res.statusCode).toBe(200);
    const byUser = new Map((res.json() as TelegramCandidatesResponse).candidates.map((c) => [c.username, c]));
    expect([...byUser.keys()].sort()).toEqual(["ada", "cat_admin", "jo_joined", "sam_says"]);
    expect(byUser.get("jo_joined")).toMatchObject({ displayName: "Jo", memberId: null });
    expect(byUser.get("cat_admin")).toMatchObject({ displayName: "Cat", memberId: null });
  });
});
