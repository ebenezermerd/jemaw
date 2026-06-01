/**
 * scanGroup tests with a MOCKED Gemini client (no network). Uses the local
 * Postgres for members/messages/suggestions. Skips if no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { upsertGroup, upsertMember, captureMessage, getGroupById } from "../repo.js";
import { scanGroup } from "./scan.js";
import type { GeminiClient } from "./geminiClient.js";
import {
  groups,
  members,
  messages,
  suggestions,
  aiRuns,
} from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { Group } from "@jemaw/shared/schema";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("scanGroup (mocked Gemini)", () => {
  let db: Db;
  let group: Group;
  let saraTg: number;
  let tomTg: number;
  const now = () => 1_780_000_000_000;

  function mockGemini(json: unknown): GeminiClient {
    return { suggest: async () => ({ json, inputTokens: 100, outputTokens: 50 }) };
  }
  const throwingGemini: GeminiClient = {
    suggest: async () => {
      throw new Error("api down");
    },
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const base = BigInt(-4_000_000_000 - Math.floor(process.uptime() * 1000));
    saraTg = Number(base - 1n);
    tomTg = Number(base - 2n);
    const g = await upsertGroup(db, base, "ScanTrip", "EUR");
    group = g;
    await upsertMember(db, g.id, BigInt(saraTg), "Sara", null);
    await upsertMember(db, g.id, BigInt(tomTg), "Tom", null);
    // Two messages mentioning an expense.
    await captureMessage(db, g.id, 1001n, BigInt(saraTg), "I got dinner ~50", new Date());
    await captureMessage(db, g.id, 1002n, BigInt(tomTg), "thanks!", new Date());
  });

  afterAll(async () => {
    await db.delete(suggestions).where(eq(suggestions.groupId, group.id));
    await db.delete(aiRuns).where(eq(aiRuns.groupId, group.id));
    await db.delete(messages).where(eq(messages.groupId, group.id));
    await db.delete(members).where(eq(members.groupId, group.id));
    await db.delete(groups).where(eq(groups.id, group.id));
  });

  it("writes suggestions from a valid Gemini response", async () => {
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup(
      { db, gemini: mockGemini({
        suggestions: [
          {
            confidence: 0.85,
            description: "Dinner",
            amount: 50,
            currency: "EUR",
            payer_telegram_id: saraTg,
            split_type: "equal",
            split_with: [saraTg, tomTg],
            shares: null,
            evidence_message_ids: [1001],
            reasoning: "Sara got dinner ~50",
          },
        ],
        scan_window: { from_message_id: 1001, to_message_id: 1002 },
      }), now },
      g,
      null,
      "keyword",
    );
    expect(res.status).toBe("success");
    expect(res.written).toBe(1);
    expect(res.pendingCount).toBe(1);
  });

  it("drops a low-confidence (<0.5) suggestion", async () => {
    // Reset last_scan so messages are in window again.
    await db.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, group.id));
    await db.delete(suggestions).where(eq(suggestions.groupId, group.id));
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup(
      { db, gemini: mockGemini({
        suggestions: [
          {
            confidence: 0.3,
            description: "Maybe coffee",
            amount: 4,
            currency: "EUR",
            payer_telegram_id: saraTg,
            split_type: "equal",
            split_with: [saraTg],
            shares: null,
            evidence_message_ids: [1001],
            reasoning: "unsure",
          },
        ],
        scan_window: { from_message_id: 1001, to_message_id: 1002 },
      }), now },
      g,
      null,
      "command",
    );
    expect(res.written).toBe(0);
  });

  it("drops a suggestion referencing an unknown member", async () => {
    await db.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, group.id));
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup(
      { db, gemini: mockGemini({
        suggestions: [
          {
            confidence: 0.9,
            description: "Ghost",
            amount: 10,
            currency: "EUR",
            payer_telegram_id: 999999999,
            split_type: "equal",
            split_with: [999999999],
            shares: null,
            evidence_message_ids: [1001],
            reasoning: "unknown member",
          },
        ],
        scan_window: { from_message_id: 1001, to_message_id: 1002 },
      }), now },
      g,
      null,
      "manual",
    );
    expect(res.written).toBe(0);
  });

  it("records api_error and surfaces nothing on a client failure", async () => {
    await db.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, group.id));
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup(
      { db, gemini: throwingGemini, now },
      g,
      null,
      "keyword",
    );
    expect(res.status).toBe("api_error");
    expect(res.written).toBe(0);
  });

  it("detects a settlement mention as a settlement suggestion", async () => {
    await db.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, group.id));
    await db.delete(suggestions).where(eq(suggestions.groupId, group.id));
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup(
      { db, gemini: mockGemini({
        suggestions: [],
        settlements: [
          {
            confidence: 0.9,
            from_telegram_id: tomTg,
            to_telegram_id: saraTg,
            amount: 25,
            currency: "EUR",
            evidence_message_ids: [1001],
            reasoning: "Tom paid Sara back 25 for the cab",
          },
        ],
        scan_window: { from_message_id: 1001, to_message_id: 1002 },
      }), now },
      g,
      null,
      "keyword",
    );
    expect(res.written).toBe(1);
    const rows = await db.select().from(suggestions).where(eq(suggestions.groupId, group.id));
    expect(rows[0]!.kind).toBe("settlement");
    expect(rows[0]!.amount).toBe("25.00");
  });

  it("dedupes a suggestion citing an already-handled message", async () => {
    await db.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, group.id));
    await db.delete(suggestions).where(eq(suggestions.groupId, group.id));
    const g = (await getGroupById(db, group.id))!;
    const resp = {
      suggestions: [
        {
          confidence: 0.9,
          description: "Dinner",
          amount: 50,
          currency: "EUR",
          payer_telegram_id: saraTg,
          split_type: "equal",
          split_with: [saraTg, tomTg],
          shares: null,
          evidence_message_ids: [1001],
          reasoning: "Sara got dinner",
        },
      ],
      scan_window: { from_message_id: 1001, to_message_id: 1002 },
    };
    // First scan inserts it.
    const r1 = await scanGroup({ db, gemini: mockGemini(resp), now }, g, null, "keyword");
    expect(r1.written).toBe(1);
    // Same message cited again → deduped, nothing new written.
    const r2 = await scanGroup({ db, gemini: mockGemini(resp), now }, g, null, "keyword");
    expect(r2.written).toBe(0);
  });

  it("returns no_messages only when the group has no messages at all", async () => {
    // The pointer no longer gates the window; emptiness does. Temporarily clear.
    await db.delete(messages).where(eq(messages.groupId, group.id));
    const g = (await getGroupById(db, group.id))!;
    const res = await scanGroup({ db, gemini: mockGemini({}), now }, g, null, "keyword");
    expect(res.status).toBe("no_messages");
    // Restore for any later runs in the file (none after this, but tidy).
    await captureMessage(db, group.id, 1001n, BigInt(saraTg), "I got dinner ~50", new Date());
  });
});
