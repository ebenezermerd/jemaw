/**
 * Boss mode in chat against the local Postgres: a pause holds for everyone
 * else, a boss is still answered, and a boss's "enough" ends it. Uses the
 * template composer (no model). Skips if no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Api } from "grammy";
import { aiRuns, botReplies, groups, members, messages, suggestions } from "@jemaw/shared/schema";
import { createDb, type Db } from "../../db.js";
import { getGroupById, mergeGroupSettings, upsertGroup, upsertMember } from "../../repo.js";
import { maybeDeliverDirectChat } from "./deliver.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("boss mode in chat", () => {
  let db: Db;
  let groupId: string;
  const bossTg = 7_700_001n;
  const memberTg = 7_700_002n;
  const sendMessage = vi.fn(async () => ({ message_id: 1 }));
  const api = { sendMessage } as unknown as Api;
  const boss = { tone: "respect" as const, skipPause: true, canEndPause: true };

  async function pause() {
    const g = (await getGroupById(db, groupId))!;
    const humor = (g.settings as { humor: Record<string, unknown> }).humor;
    await mergeGroupSettings(db, groupId, {
      humor: { ...humor, chatSulkUntil: new Date(Date.now() + 30 * 60_000).toISOString(), chatSulkPendingCount: 1 },
    });
  }
  const paused = async () =>
    Boolean(((await getGroupById(db, groupId))!.settings as { humor: { chatSulkUntil?: string } }).humor.chatSulkUntil);
  const say = async (text: string, from: bigint, asBoss: boolean) =>
    maybeDeliverDirectChat({
      db,
      api,
      group: (await getGroupById(db, groupId))!,
      userText: text,
      currency: "ETB",
      humor: {},
      askerTelegramId: from,
      ...(asBoss ? { boss } : {}),
      bossIds: [String(bossTg)],
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const chat = BigInt(-6_000_000_000 - Math.floor(process.uptime() * 1000));
    groupId = (await upsertGroup(db, chat, "BossTrip", "ETB")).id;
    await mergeGroupSettings(db, groupId, {
      humor: { version: 1, mode: "roast", publicRepliesEnabled: true, cooldownMinutes: 0, maxPublicRepliesPerDay: 50 },
    });
    await upsertMember(db, groupId, bossTg, "Ebenezer", null);
    await upsertMember(db, groupId, memberTg, "Amanuel", null);
    const [run] = await db
      .insert(aiRuns)
      .values({ groupId, triggerType: "keyword", fromMessageId: 1n, toMessageId: 1n, status: "success" })
      .returning();
    await db.insert(suggestions).values({
      groupId,
      aiRunId: run!.id,
      confidence: "0.90",
      description: "Pomi draft",
      amount: "1000",
      splitType: "equal",
      splitWith: [],
      evidenceMessageIds: [],
      reasoning: "test",
    });
  });

  afterAll(async () => {
    await db.delete(botReplies).where(eq(botReplies.groupId, groupId));
    await db.delete(suggestions).where(eq(suggestions.groupId, groupId));
    await db.delete(aiRuns).where(eq(aiRuns.groupId, groupId));
    await db.delete(messages).where(eq(messages.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  });

  it("stays quiet for a member but still answers the boss during a pause", async () => {
    await pause();
    expect(await say("you there jemaw", memberTg, false)).toBe(false);
    const muted = await db.select().from(botReplies).where(eq(botReplies.groupId, groupId));
    expect(muted.map((r) => r.suppressionReason)).toContain("chat_sulk");
    expect(await say("you there jemaw", bossTg, true)).toBe(true);
    expect(await paused()).toBe(true);
  });

  it("ends the pause for everyone when the boss says enough", async () => {
    await pause();
    expect(await say("jemaw enough", bossTg, true)).toBe(true);
    expect(await paused()).toBe(false);
  });
});
