/**
 * Answer a ledger question in the group: exact figures from the database,
 * plus one persona line when humor is on and ledger banter is allowed.
 * Explicit questions skip the humor quota and cooldown: someone asked.
 */
import type { Api } from "grammy";
import type { Db } from "../../db.js";
import type { Group } from "@jemaw/shared/schema";
import { parseHumorSettings } from "@jemaw/shared/humor";
import { insertBotReply } from "../../repo.js";
import type { LoadingHandle } from "../../telegram/loading.js";
import { escapeHtml } from "../../telegram/announcements.js";
import type { HumorRuntime } from "../humor/deliver.js";
import type { LedgerQuery } from "../humor/intent.js";
import { buildLedgerSnapshot } from "./snapshot.js";
import { namedMember, openDebtsFor, renderLedgerFacts } from "./answer.js";
import { composeLedgerPersonaLine } from "./persona.js";
import { composePost, DEFAULT_POST_DESIGNS, type PostDesigns } from "@jemaw/shared/posts";
import { sendPost } from "../../telegram/sendPost.js";
import type { BossTone } from "@jemaw/shared/boss";
import { postContext, type PostLinks } from "../../telegram/postLinks.js";

export const APPROVE_DRAFTS_DATA = "ad";

const REPORT_TITLE: Record<LedgerQuery["kind"], string> = {
  whoami: "About you",
  leaderboard: "Who paid the most",
  my_balance: "Your open payments",
  who_owes: "Open payments",
  expense_list: "Expenses",
  totals: "Spending",
  pending: "Drafts waiting",
  overview: "Group overview",
};

export async function deliverLedgerAnswer(input: {
  db: Db;
  group: Group;
  askerTelegramId: bigint | null;
  query: LedgerQuery;
  loading: LoadingHandle;
  humor: HumorRuntime;
  /** Plain line shown above the answer, e.g. an apology when redoing one. */
  lead?: string;
  /** What was asked, to find a member the question names. */
  questionText?: string;
  /** Set when a super admin asked: how gently the joke line treats them. */
  bossTone?: BossTone;
  /** The asker may change the books from chat, so drafts get an approve button. */
  canAct?: boolean;
  /** Where the post goes and how it looks; defaults keep tests simple. */
  api?: Api;
  chatId?: number;
  designs?: PostDesigns;
  links?: PostLinks;
}): Promise<void> {
  const started = Date.now();
  const settings = parseHumorSettings(
    (input.group.settings as Record<string, unknown> | null)?.humor,
  );
  try {
    const snapshot = await buildLedgerSnapshot(input.db, input.group, input.askerTelegramId);
    const person =
      input.query.kind === "who_owes" && input.questionText
        ? namedMember(input.questionText, snapshot.balances.map((m) => m.name))
        : null;
    const query: LedgerQuery = person ? { ...input.query, person } : input.query;
    const facts = renderLedgerFacts(query, snapshot);
    // Everyone's open payments by default; the asker's own only when they asked about themselves.
    const mine = input.query.kind === "my_balance";
    const drafts = input.query.kind === "pending";
    const payments = mine || drafts || input.query.kind === "who_owes";
    const design = (input.designs ?? DEFAULT_POST_DESIGNS)[payments ? "ai_payments" : "ai_report"];
    const banterAsked = input.query.kind === "leaderboard";
    const persona =
      settings.mode !== "off" && settings.ledgerBanter && (banterAsked || design.sections.note)
        ? await composeLedgerPersonaLine({
            client: input.humor.client,
            mode: settings.mode,
            snapshot,
            query,
            bossTone: input.bossTone,
          })
        : null;
    // A brag question is banter: the persona line is the reply, with no table above it.
    const banter = banterAsked && persona != null;
    let text: string;
    let messageId: number | null;
    if (banter || !input.api || input.chatId == null) {
      const answer = banter ? escapeHtml(persona.text) : facts;
      const body = input.lead ? `${escapeHtml(input.lead)}\n\n${answer}` : answer;
      text = persona && !banter ? `${body}\n\n<i>${escapeHtml(persona.text)}</i>` : body;
      messageId = await input.loading.finish(text, { parse_mode: "HTML" });
    } else {
      const note = persona?.text ?? null;
      const post = composePost(
        payments
          ? {
              useCase: "ai_payments",
              data: {
                currency: snapshot.currency,
                name: snapshot.asker?.name ?? null,
                owes: snapshot.asker?.owes ?? [],
                owedBy: snapshot.asker?.owedBy ?? [],
                ...(drafts
                  ? { drafts: snapshot.pending.drafts, draftCount: snapshot.pending.count }
                  : mine
                    ? {}
                    : { debts: openDebtsFor(snapshot, query.person), person: query.person ?? null }),
                note,
                lead: input.lead ?? null,
              },
            }
          : {
              useCase: "ai_report",
              data: { title: REPORT_TITLE[input.query.kind], html: facts, note, lead: input.lead ?? null },
            },
        design,
        postContext(input.links, input.group.id),
      );
      if (drafts && input.canAct && snapshot.pending.count > 0) {
        post.keyboard = [...post.keyboard, [{ text: "Approve some…", callback_data: APPROVE_DRAFTS_DATA, style: "success" }]];
      }
      const { api, chatId } = input;
      text = post.html;
      // A failed send throws to the catch below, which apologises in the placeholder.
      messageId = await input.loading.finishWith(
        async (placeholder) => (await sendPost(api, chatId, post, { editMessageId: placeholder })).messageId,
      );
    }
    console.log(
      `[ledger] answered group=${input.group.id} query=${JSON.stringify(query)} persona=${persona?.source ?? "none"}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: "ledger_question",
      channel: "group",
      decision: messageId == null ? "failed" : "sent",
      ...(messageId == null ? { suppressionReason: "send_failed" } : {}),
      templateId: persona?.source === "template" ? "ledger_persona" : null,
      provider: persona?.source === "model" ? (input.humor.provider ?? null) : null,
      model: persona?.source === "model" ? (input.humor.model ?? null) : null,
      factPacketRedacted: query,
      selectedText: text,
      riskClass: "green",
      telegramMessageId: messageId == null ? null : BigInt(messageId),
      latencyMs: Date.now() - started,
      inputTokens: persona?.inputTokens ?? null,
      outputTokens: persona?.outputTokens ?? null,
    });
  } catch (err) {
    console.error(
      `[ledger] failed group=${input.group.id}:`,
      err instanceof Error ? err.message : err,
    );
    await input.loading.finish("🫠 The ledger slipped out of my hands. Ask me again in a moment.");
  }
}
