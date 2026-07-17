/**
 * Run humor after a scan: vibe update, fact packet, compose, send, audit.
 */
import { createHash } from "node:crypto";
import type { Api } from "grammy";
import type { Db } from "../../db.js";
import type { Group } from "@jemaw/shared/schema";
import {
  parseHumorSettings,
  parseGroupVibe,
  parseMemberHumorPrefs,
} from "@jemaw/shared/humor";
import type { ScanClient } from "../geminiClient.js";
import { buildScanOutcomePacket } from "./factPacket.js";
import { composeHumorReply } from "./service.js";
import {
  extractStyleFeatures,
  mergeVibeProfile,
  pickStyleSamples,
} from "./styleProfile.js";
import {
  countBotRepliesSince,
  insertBotReply,
  listRecentBotReplyTexts,
  lastBotReplyAt,
  listPendingSuggestions,
  lastNMessages,
  listMembers,
  getHumorMemberPrefs,
  mergeGroupSettings,
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
  const settingsRaw = input.group.settings as Record<string, unknown> | null;
  const settings = parseHumorSettings(settingsRaw?.humor);

  if (settings.mode === "off") {
    console.log(`[humor] suppressed group=${input.group.id} reason=mode_off`);
    return;
  }

  if (input.scanStatus !== "success" && input.scanStatus !== "no_messages") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=scan_status_${input.scanStatus}`,
    );
    return;
  }

  const [members, pending, msgs, prefsMap] = await Promise.all([
    listMembers(input.db, input.group.id),
    listPendingSuggestions(input.db, input.group.id),
    lastNMessages(input.db, input.group.id, 50),
    loadPrefsMap(input.db, input.group.id),
  ]);

  // Phase 3: style samples only from members who contribute
  const memberByTg = new Map(
    members.map((m) => [m.telegramUserId.toString(), m]),
  );
  const styleMsgs = msgs.map((m) => {
    const mem = memberByTg.get(m.senderTelegramUserId.toString());
    const prefs = mem ? prefsMap.get(mem.id) : undefined;
    const contribute =
      !mem || (prefs?.contributeToStyleProfile ?? true);
    return {
      text: m.text,
      sentAt: m.sentAt,
      contribute,
    };
  });

  let vibe = parseGroupVibe(settingsRaw?.vibe);
  if (settings.useGroupVibe) {
    const features = extractStyleFeatures(styleMsgs);
    vibe = mergeVibeProfile(vibe, features);
    // Persist vibe (fire-and-forget merge after send path also ok; do before compose)
    await mergeGroupSettings(input.db, input.group.id, { vibe }).catch((err) =>
      console.warn(`[humor] vibe save failed:`, err?.message ?? err),
    );
  }

  const allowedTargetNames: string[] = [];
  const allowedTargetMemberIds: string[] = [];
  if (
    settings.memberTargeting === "consenting_members" &&
    (settings.mode === "roast" || settings.mode === "chaos")
  ) {
    for (const m of members.filter((x) => x.isActive)) {
      const p = prefsMap.get(m.id);
      if (p?.allowDirectReference) {
        allowedTargetNames.push(m.displayName);
        allowedTargetMemberIds.push(m.id);
      }
    }
  }

  const draftLabels = pending
    .slice(0, 5)
    .map((s) => s.description)
    .filter(Boolean);

  const categories = uniqueCategories(draftLabels);

  const languageHint =
    settings.languageMode === "auto"
      ? vibe.languages[0]?.code
      : settings.languageMode === "code_mix"
        ? "en+am"
        : settings.languageMode;

  const packet = buildScanOutcomePacket({
    written: input.written,
    pendingCount: input.pendingCount || pending.length,
    currency: input.currency,
    draftLabels,
    categories,
    allowedTargetNames,
    allowedTargetMemberIds,
    vibe: settings.useGroupVibe ? vibe : null,
    languageHint,
  });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, lastAt, recentTexts] = await Promise.all([
    countBotRepliesSince(input.db, input.group.id, dayStart),
    lastBotReplyAt(input.db, input.group.id),
    listRecentBotReplyTexts(input.db, input.group.id, 20),
  ]);

  const styleSamples = settings.useGroupVibe
    ? pickStyleSamples(styleMsgs, 6)
    : [];

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
    vibe: settings.useGroupVibe ? vibe : null,
    styleSamples,
  });

  if (composed.decision === "do_not_reply") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=${composed.reason} outcome=${packet.outcome}`,
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
      `[humor] sent group=${input.group.id} source=${composed.source} outcome=${packet.outcome} text_len=${composed.text.length}`,
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

async function loadPrefsMap(db: Db, groupId: string) {
  const map = new Map<
    string,
    ReturnType<typeof parseMemberHumorPrefs>
  >();
  try {
    const rows = await getHumorMemberPrefs(db, groupId);
    for (const r of rows) {
      map.set(
        r.memberId,
        parseMemberHumorPrefs({
          contributeToStyleProfile: r.contributeToStyleProfile,
          allowCallbackFromMessages: r.allowCallbackFromMessages,
          allowDirectReference: r.allowDirectReference,
          allowPublicFinancialRoasting: r.allowPublicFinancialRoasting,
          allowHardshipHumor: r.allowHardshipHumor,
          allowRelationshipHumor: r.allowRelationshipHumor,
          allowSecurityIncidentHumor: r.allowSecurityIncidentHumor,
          allowProfanityTargeting: r.allowProfanityTargeting,
        }),
      );
    }
  } catch (err) {
    console.warn(`[humor] prefs load failed:`, err instanceof Error ? err.message : err);
  }
  return map;
}

function uniqueCategories(labels: string[]): string[] {
  const cats = new Set<string>();
  for (const l of labels) {
    const low = l.toLowerCase();
    if (/grocer|food|dinner|lunch|breakfast|meal/.test(low)) cats.add("food");
    else if (/ride|taxi|uber|transport|fuel/.test(low)) cats.add("transport");
    else if (/rent|house|building|water|pipe|maid|salary/.test(low))
      cats.add("home");
    else cats.add("other");
  }
  return [...cats].slice(0, 5);
}

function hashPacket(packet: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(packet))
    .digest("hex")
    .slice(0, 16);
}
