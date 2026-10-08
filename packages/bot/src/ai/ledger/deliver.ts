/**
 * Answer a ledger question in the group: exact figures from the database,
 * plus one persona line when humor is on and ledger banter is allowed.
 * Explicit questions skip the humor quota and cooldown: someone asked.
 */
import type { Db } from "../../db.js";
import type { Group } from "@jemaw/shared/schema";
import { parseHumorSettings } from "@jemaw/shared/humor";
import { insertBotReply } from "../../repo.js";
import type { LoadingHandle } from "../../telegram/loading.js";
import { escapeHtml } from "../../telegram/announcements.js";
import type { HumorRuntime } from "../humor/deliver.js";
import type { LedgerQuery } from "../humor/intent.js";
import { buildLedgerSnapshot } from "./snapshot.js";
import { renderLedgerFacts } from "./answer.js";
import { composeLedgerPersonaLine } from "./persona.js";

export async function deliverLedgerAnswer(input: {
  db: Db;
  group: Group;
  askerTelegramId: bigint | null;
  query: LedgerQuery;
  loading: LoadingHandle;
  humor: HumorRuntime;
  /** Plain line shown above the answer, e.g. an apology when redoing one. */
  lead?: string;
}): Promise<void> {
  const started = Date.now();
  const settings = parseHumorSettings(
    (input.group.settings as Record<string, unknown> | null)?.humor,
  );
  try {
    const snapshot = await buildLedgerSnapshot(input.db, input.group, input.askerTelegramId);
    const facts = renderLedgerFacts(input.query, snapshot);
    const persona =
      settings.mode !== "off" && settings.ledgerBanter
        ? await composeLedgerPersonaLine({
            client: input.humor.client,
            mode: settings.mode,
            snapshot,
            query: input.query,
          })
        : null;
    const body = input.lead ? `${escapeHtml(input.lead)}\n\n${facts}` : facts;
    const text = persona ? `${body}\n\n<i>${escapeHtml(persona.text)}</i>` : body;
    const messageId = await input.loading.finish(text, { parse_mode: "HTML" });
    console.log(
      `[ledger] answered group=${input.group.id} query=${JSON.stringify(input.query)} persona=${persona?.source ?? "none"}`,
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
      factPacketRedacted: input.query,
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
