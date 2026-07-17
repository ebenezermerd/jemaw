/**
 * Run humor after a scan (or other event): compose, send to Telegram, audit.
 */
import { createHash } from "node:crypto";
import type { Api } from "grammy";
import type { Db } from "../../db.js";
import type { Group } from "@jemaw/shared/schema";
import { parseHumorSettings } from "@jemaw/shared/humor";
import type { ScanClient } from "../geminiClient.js";
import {
  buildScanHitPacket,
  buildScanMissPacket,
} from "./factPacket.js";
import { composeHumorReply } from "./service.js";
import {
  countBotRepliesSince,
  insertBotReply,
  listRecentBotReplyTexts,
  lastBotReplyAt,
} from "../../repo.js";

export interface HumorRuntime {
  client?: ScanClient;
  provider?: string;
  model?: string;
}

export async function maybeDeliverScanHumor(input: {
  db: Db;
  api: Api;
  group: Group;
  written: number;
  pendingCount: number;
  scanStatus: string;
  directInvocation: boolean;
  currency: string;
  humor: HumorRuntime;
}): Promise<void> {
  const started = Date.now();
  const settings = parseHumorSettings(
    (input.group.settings as Record<string, unknown> | null)?.humor,
  );

  if (settings.mode === "off") {
    console.log(`[humor] suppressed group=${input.group.id} reason=mode_off`);
    return;
  }

  const packet =
    input.written > 0 || input.pendingCount > 0
      ? buildScanHitPacket({
          suggestionCount: Math.max(input.written, input.pendingCount),
          currency: input.currency,
        })
      : buildScanMissPacket();

  // scan with zero written and zero pending after success → miss
  if (input.scanStatus !== "success" && input.scanStatus !== "no_messages") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=scan_status_${input.scanStatus}`,
    );
    return;
  }
  if (input.scanStatus === "no_messages") {
    // treat as miss only on direct invocation
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, lastAt, recentTexts] = await Promise.all([
    countBotRepliesSince(input.db, input.group.id, dayStart),
    lastBotReplyAt(input.db, input.group.id),
    listRecentBotReplyTexts(input.db, input.group.id, 20),
  ]);

  const composed = await composeHumorReply({
    settings,
    factPacket: packet,
    nowMs: Date.now(),
    publicRepliesToday,
    lastPublicReplyAtMs: lastAt ? lastAt.getTime() : null,
    directInvocation: input.directInvocation,
    recentReplyTexts: recentTexts,
    humorClient: input.humor.client,
    humorProvider: input.humor.provider,
    humorModel: input.humor.model,
  });

  if (composed.decision === "do_not_reply") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=${composed.reason}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: packet.event,
      channel: "group",
      decision: "suppressed",
      suppressionReason: composed.reason,
      factPacketRedacted: packet,
      factHash: hashPacket(packet),
      riskClass: packet.risk,
      latencyMs: Date.now() - started,
    });
    return;
  }

  try {
    const sent = await input.api.sendMessage(
      Number(input.group.telegramChatId),
      composed.text,
    );
    console.log(
      `[humor] sent group=${input.group.id} source=${composed.source} text_len=${composed.text.length}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: packet.event,
      channel: composed.channel,
      decision: "sent",
      templateId: composed.templateId,
      provider: composed.provider ?? null,
      model: composed.model ?? null,
      promptVersion: composed.promptVersion ?? null,
      factPacketRedacted: packet,
      factHash: hashPacket(packet),
      candidateTexts: composed.candidates,
      selectedText: composed.text,
      selectedStyle: composed.style,
      riskClass: packet.risk,
      telegramMessageId: BigInt(sent.message_id),
      latencyMs: Date.now() - started,
      inputTokens: composed.inputTokens ?? null,
      outputTokens: composed.outputTokens ?? null,
    });
  } catch (err) {
    console.error(
      `[humor] send failed group=${input.group.id}:`,
      err instanceof Error ? err.message : err,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: packet.event,
      channel: "group",
      decision: "failed",
      suppressionReason:
        err instanceof Error ? err.message.slice(0, 200) : "send_failed",
      selectedText: composed.text,
      factPacketRedacted: packet,
      factHash: hashPacket(packet),
      latencyMs: Date.now() - started,
    });
  }
}

function hashPacket(packet: unknown): string {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex").slice(0, 16);
}
