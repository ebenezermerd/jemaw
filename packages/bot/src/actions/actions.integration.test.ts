// Chat actions end to end against the local Postgres. Skips if no DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  aiRuns,
  chatActions,
  expenseShares,
  expenses,
  groups,
  members,
  settlementAllocations,
  settlements,
  suggestions,
  type Group,
  type Member,
} from "@jemaw/shared/schema";
import { createDb, type Db } from "../db.js";
import { claimChatAction, createExpenseWithShares, getSuggestion, insertChatAction, upsertGroup, upsertMember } from "../repo.js";
import { loadLedger } from "../domain/ledger.js";
import { planAction } from "./plan.js";
import { executeAction } from "./execute.js";
import type { ActionPlan, ActionRequest } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("chat actions", () => {
  let db: Db;
  let group: Group;
  let me: Member;
  let pomi: Member;
  let tsin: Member;

  const addExpense = (payer: Member, amount: string, description: string, split: Member[]) =>
    createExpenseWithShares(
      db,
      { groupId: group.id, payerMemberId: payer.id, amount, kind: "expense", currency: "ETB", description, source: "manual", createdByMemberId: payer.id, occurredAt: new Date() },
      split.map((m) => ({ memberId: m.id, shareAmount: (Number(amount) / split.length).toFixed(2) })),
    );

  async function plan(req: ActionRequest): Promise<ActionPlan> {
    const res = await planAction(db, group, me, req);
    if ("message" in res) throw new Error(res.message);
    return res.plan;
  }

  async function confirm(p: ActionPlan, selected = p.selected) {
    const row = await insertChatAction(db, {
      groupId: group.id,
      requestedByTelegramId: 1n,
      actorMemberId: me.id,
      kind: p.kind,
      payload: { ...p.payload, multi: p.multi },
      options: p.options,
      selected,
      chatId: group.telegramChatId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await claimChatAction(db, row.id, "done")).toBe(true);
    expect(await claimChatAction(db, row.id, "done")).toBe(false);
    return executeAction(db, group, { ...row, selected });
  }

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const chat = BigInt(-7_000_000_000 - Math.floor(process.uptime() * 1000));
    group = await upsertGroup(db, chat, "ActionTrip", "ETB");
    me = await upsertMember(db, group.id, 8_800_001n, "Ebenezer", null);
    pomi = await upsertMember(db, group.id, 8_800_002n, "Pomi", null);
    tsin = await upsertMember(db, group.id, 8_800_003n, "Tsin", null);
    await addExpense(pomi, "600", "Lunch", [me, pomi, tsin]);
    await addExpense(pomi, "900", "Dinner", [me, pomi, tsin]);
    await addExpense(tsin, "300", "Coffee", [me, tsin]);
    const [run] = await db.insert(aiRuns).values({ groupId: group.id, triggerType: "keyword", fromMessageId: 1n, toMessageId: 1n, status: "success" }).returning();
    for (const description of ["Groceries on Sept 2", "Taxi home"]) {
      await db.insert(suggestions).values({
        groupId: group.id, aiRunId: run!.id, confidence: "0.90", description, amount: "300",
        payerMemberId: pomi.id, splitType: "equal", splitWith: [me.id, pomi.id], evidenceMessageIds: [], reasoning: "t",
      });
    }
  });

  afterAll(async () => {
    const exp = db.select({ id: expenses.id }).from(expenses).where(eq(expenses.groupId, group.id));
    const set = db.select({ id: settlements.id }).from(settlements).where(eq(settlements.groupId, group.id));
    await db.delete(chatActions).where(eq(chatActions.groupId, group.id));
    await db.delete(settlementAllocations).where(inArray(settlementAllocations.settlementId, set));
    await db.delete(expenseShares).where(inArray(expenseShares.expenseId, exp));
    await db.delete(settlements).where(eq(settlements.groupId, group.id));
    await db.delete(expenses).where(eq(expenses.groupId, group.id));
    await db.delete(suggestions).where(eq(suggestions.groupId, group.id));
    await db.delete(aiRuns).where(eq(aiRuns.groupId, group.id));
    await db.delete(members).where(eq(members.groupId, group.id));
    await db.delete(groups).where(eq(groups.id, group.id));
  });

  it("settles mine to Pomi for only the expenses Pomi paid", async () => {
    const p = await plan({ action: "settle", from: "me", to: "pomi" });
    expect(p.options.map((o) => o.label.split(" · ")[0])).toEqual(["Lunch", "Dinner"]);
    const out = await confirm(p);
    expect(out).toMatchObject({ ok: true });
    expect(out.text).toContain("Ebenezer paid Pomi 500 ETB");
    const { transfers } = await loadLedger(db, group.id);
    expect(transfers.some((t) => t.fromMemberId === me.id && t.toMemberId === pomi.id)).toBe(false);
    expect(await planAction(db, group, me, { action: "settle", from: "me", to: "pomi" })).toEqual({
      message: "Ebenezer doesn't owe Pomi anything right now.",
    });
  });

  it("approves one draft and dismisses another", async () => {
    const approve = await plan({ action: "approve_drafts", match: "groceries" });
    expect(approve.options).toHaveLength(1);
    expect((await confirm(approve)).text).toContain("Added to the ledger: Groceries on Sept 2");
    const dismiss = await plan({ action: "dismiss_drafts", match: "taxi" });
    expect((await confirm(dismiss)).text).toContain("Dismissed: Taxi home");
    const rows = await db.select().from(suggestions).where(eq(suggestions.groupId, group.id));
    expect(rows.map((r) => r.status).sort()).toEqual(["confirmed", "dismissed"]);
    expect(await getSuggestion(db, group.id, approve.options[0]!.id)).toMatchObject({ resolvedByMemberId: me.id });
  });

  it("adds an expense split with the named people and the payer", async () => {
    const p = await plan({ action: "add_expense", amount: "600", description: "Pizza", participants: ["pomi", "tsin"] });
    expect(p.title).toContain("Ebenezer 200, Pomi 200, Tsin 200");
    expect((await confirm(p)).ok).toBe(true);
    const [row] = await db.select().from(expenses).where(eq(expenses.description, "Pizza"));
    expect(row).toMatchObject({ payerMemberId: me.id, createdByMemberId: me.id, amount: "600.00" });
  });

  it("deletes an expense and a payment", async () => {
    const del = await plan({ action: "delete_expense", match: "coffee" });
    expect(del.selected).toEqual([0]);
    expect((await confirm(del)).text).toContain("Deleted: Coffee");
    const pay = await plan({ action: "delete_payment", from: "me", to: "pomi" });
    expect((await confirm(pay)).ok).toBe(true);
    expect(await db.select().from(settlements).where(eq(settlements.groupId, group.id))).toHaveLength(0);
  });

  it("explains instead of guessing when it can't tell who", async () => {
    expect(await planAction(db, group, me, { action: "settle", to: "nobody" })).toEqual({
      message: "Who's paying whom? Try: jemaw settle mine to Pomi.",
    });
  });
});
