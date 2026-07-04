/**
 * Integration tests for the admin Telegram identity endpoints: candidate
 * listing and account assign / swap / unlink.
 *
 * Skips automatically if DATABASE_URL is unset (e.g. CI without a DB).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import {
  upsertGroup,
  upsertMember,
  addManualMember,
  setMemberRole,
  captureMessage,
} from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import { groups, members, messages } from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  MemberDto,
  TelegramCandidatesResponse,
} from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:INTEGRATION-TOKEN";
const NOW = 1_780_000_000;

const d = DATABASE_URL ? describe : describe.skip;

d("Telegram identity API", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let chatId: bigint;
  let adminTgId: bigint;
  let bobTgId: bigint;
  let strangerTgId: bigint;
  let bobMemberId: string;
  let manualMemberId: string;

  function initDataFor(tgUserId: bigint): string {
    return signInitDataForTest(
      {
        auth_date: String(NOW - 5),
        user: JSON.stringify({ id: Number(tgUserId), first_name: "U" }),
      },
      BOT_TOKEN,
    );
  }

  async function getMembers(asTgId: bigint): Promise<MemberDto[]> {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: { "x-telegram-init-data": initDataFor(asTgId) },
    });
    return (res.json() as { members: MemberDto[] }).members;
  }

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    chatId = BigInt(-2_000_000_000 - Math.floor(process.uptime() * 1000));
    adminTgId = -chatId + 1n;
    bobTgId = -chatId + 2n;
    strangerTgId = -chatId + 3n;

    const g = await upsertGroup(db, chatId, "Identity", "ETB");
    groupId = g.id;
    await upsertMember(db, groupId, adminTgId, "Admin", "admin");
    const bob = await upsertMember(db, groupId, bobTgId, "Bob", "bob");
    const manual = await addManualMember(db, groupId, "Abel", null);
    bobMemberId = bob.id;
    manualMemberId = manual.id;
    await setMemberRole(db, groupId, adminTgId, "admin");
    await captureMessage(db, groupId, 1n, strangerTgId, "hi", new Date());

    app = await buildServer({
      api: {
        db,
        botToken: BOT_TOKEN,
        now: () => NOW,
        scanLimiter: { tryAcquire: () => true } as never,
      },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
    await app.close();
  });

  it("marks manual members unlinked and real members linked in the group DTO", async () => {
    const list = await getMembers(adminTgId);
    const manual = list.find((m) => m.id === manualMemberId)!;
    const bob = list.find((m) => m.id === bobMemberId)!;
    expect(manual.telegramLinked).toBe(false);
    expect(bob.telegramLinked).toBe(true);
  });

  it("rejects candidates and assignment for non admins", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/members/telegram-candidates`,
      headers: { "x-telegram-init-data": initDataFor(bobTgId) },
    });
    expect(listRes.statusCode).toBe(403);
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/members/${manualMemberId}/telegram`,
      headers: { "x-telegram-init-data": initDataFor(bobTgId) },
      payload: { telegramUserId: strangerTgId.toString() },
    });
    expect(patchRes.statusCode).toBe(403);
  });

  it("lists linked members and unattached chat senders as candidates", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/members/telegram-candidates`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TelegramCandidatesResponse;
    const ids = body.candidates.map((c) => c.telegramUserId);
    expect(ids).toContain(adminTgId.toString());
    expect(ids).toContain(bobTgId.toString());
    expect(ids).toContain(strangerTgId.toString());
    const stranger = body.candidates.find(
      (c) => c.telegramUserId === strangerTgId.toString(),
    )!;
    expect(stranger.memberId).toBeNull();
    const bob = body.candidates.find(
      (c) => c.telegramUserId === bobTgId.toString(),
    )!;
    expect(bob.memberId).toBe(bobMemberId);
  });

  it("associates an unattached telegram user with a manual member", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/members/${manualMemberId}/telegram`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
      payload: { telegramUserId: strangerTgId.toString(), username: "abel" },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json() as MemberDto;
    expect(dto.telegramUserId).toBe(strangerTgId.toString());
    expect(dto.telegramLinked).toBe(true);
    expect(dto.username).toBe("abel");
  });

  it("swaps identities when the target id is held by another member", async () => {
    // Abel currently holds stranger's id; give Abel bob's id instead.
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/members/${manualMemberId}/telegram`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
      payload: { telegramUserId: bobTgId.toString() },
    });
    expect(res.statusCode).toBe(200);
    const list = await getMembers(adminTgId);
    const abel = list.find((m) => m.id === manualMemberId)!;
    const bob = list.find((m) => m.id === bobMemberId)!;
    expect(abel.telegramUserId).toBe(bobTgId.toString());
    expect(bob.telegramUserId).toBe(strangerTgId.toString());
    expect(bob.telegramLinked).toBe(true);
  });

  it("unlinks a member with a null telegramUserId", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/members/${manualMemberId}/telegram`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
      payload: { telegramUserId: null },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json() as MemberDto;
    expect(dto.telegramLinked).toBe(false);
    expect(dto.username).toBeNull();
  });

  it("returns 404 for an unknown member", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/members/00000000-0000-0000-0000-000000000000/telegram`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
      payload: { telegramUserId: null },
    });
    expect(res.statusCode).toBe(404);
  });
});
