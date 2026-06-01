/**
 * Suggestions API end-to-end (confirm / dismiss). Inserts a pending suggestion
 * directly (the scan path is tested separately with a mocked Gemini), then
 * exercises the routes. Skips if no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import {
  upsertGroup,
  upsertMember,
  createAiRun,
  insertSuggestions,
} from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  suggestions,
  aiRuns,
} from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  ExpenseDto,
  SuggestionsResponse,
} from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:SUGG-TOKEN";
const NOW = 1_780_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("Suggestions API integration", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let saraTg: bigint;
  let saraId: string;
  let tomId: string;

  const h = (tg: bigint) => ({
    "x-telegram-init-data": signInitDataForTest(
      {
        auth_date: String(NOW - 5),
        user: JSON.stringify({ id: Number(tg), first_name: "U" }),
      },
      BOT_TOKEN,
    ),
  });

  async function seedSuggestion(payerId: string | null) {
    const run = await createAiRun(db, {
      groupId,
      triggeredByMemberId: null,
      triggerType: "keyword",
      fromMessageId: 1n,
      toMessageId: 2n,
      status: "success",
    });
    const rows = await insertSuggestions(db, [
      {
        groupId,
        aiRunId: run.id,
        confidence: "0.85",
        description: "Dinner",
        amount: "30.00",
        payerMemberId: payerId,
        splitType: "equal",
        splitWith: [saraId, tomId],
        shares: null,
        evidenceMessageIds: [1],
        reasoning: "test",
        status: "pending",
      },
    ]);
    return rows[0]!.id;
  }

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const base = BigInt(-5_000_000_000 - Math.floor(process.uptime() * 1000));
    saraTg = base - 1n;
    const g = await upsertGroup(db, base, "SuggTrip", "EUR");
    groupId = g.id;
    saraId = (await upsertMember(db, groupId, saraTg, "Sara", null)).id;
    tomId = (await upsertMember(db, groupId, base - 2n, "Tom", null)).id;
    app = await buildServer({
      api: { db, botToken: BOT_TOKEN, now: () => NOW },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    // Expenses reference suggestions (source_suggestion_id) → delete them first.
    const exp = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.groupId, groupId));
    for (const e of exp) {
      await db.delete(expenseShares).where(eq(expenseShares.expenseId, e.id));
    }
    await db.delete(expenses).where(eq(expenses.groupId, groupId));
    await db.delete(suggestions).where(eq(suggestions.groupId, groupId));
    await db.delete(aiRuns).where(eq(aiRuns.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
    await app.close();
  });

  it("lists pending suggestions", async () => {
    await seedSuggestion(saraId);
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/suggestions`,
      headers: h(saraTg),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SuggestionsResponse;
    expect(body.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(body.suggestions[0]!.tier).toBe("normal");
  });

  it("confirms a suggestion into an expense", async () => {
    const id = await seedSuggestion(saraId);
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/suggestions/${id}/confirm`,
      headers: h(saraTg),
    });
    expect(res.statusCode).toBe(201);
    const exp = res.json() as ExpenseDto;
    expect(exp.amount).toBe("30.00");
    expect(exp.source).toBe("ai_confirmed");

    // Confirming again → 409 (already resolved).
    const again = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/suggestions/${id}/confirm`,
      headers: h(saraTg),
    });
    expect(again.statusCode).toBe(409);
  });

  it("dismisses a suggestion", async () => {
    const id = await seedSuggestion(saraId);
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/suggestions/${id}/dismiss`,
      headers: h(saraTg),
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to confirm a payer-less suggestion (must edit)", async () => {
    const id = await seedSuggestion(null);
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/suggestions/${id}/confirm`,
      headers: h(saraTg),
    });
    expect(res.statusCode).toBe(400);
  });
});
