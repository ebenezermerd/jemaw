/**
 * Humor delivery: scan outcomes + direct social chat, with DB-grounded facts.
 */
import { createHash } from "node:crypto";
import type { Api } from "grammy";
import type { Db } from "../../db.js";
import type { Group } from "@jemaw/shared/schema";
import {
  parseHumorSettings,
  parseGroupVibe,
  parseMemberHumorPrefs,
  type HumorSettingsV1,
  type GroupVibeV1,
  type PublicSafeFactPacket,
} from "@jemaw/shared/humor";
import type { ScanClient } from "../geminiClient.js";
import {
  buildDirectChatPacket,
  buildScanOutcomePacket,
} from "./factPacket.js";
import { composeHumorReply } from "./service.js";
import { sanitizeAddressedUtterance } from "./intent.js";
import {
  extractStyleFeatures,
  mergeVibeProfile,
  pickStyleSamples,
  type StyleSampleMessage,
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

  const ctx = await loadHumorGroupContext({
    db: input.db,
    groupId: input.group.id,
    settings,
    settingsRaw,
    currency: input.currency,
  });

  const packet = buildScanOutcomePacket({
    written: input.written,
    pendingCount: input.pendingCount || ctx.pendingCount,
    currency: input.currency,
    draftLabels: ctx.draftLabels,
    drafts: ctx.drafts,
    categories: ctx.categories,
    allowedTargetNames: ctx.allowedTargetNames,
    allowedTargetMemberIds: ctx.allowedTargetMemberIds,
    activeMemberCount: ctx.activeMemberCount,
    vibe: settings.useGroupVibe ? ctx.vibe : null,
    languageHint: ctx.languageHint,
  });

  await composeAndSend({
    started,
    db: input.db,
    api: input.api,
    group: input.group,
    settings,
    packet,
    directInvocation: input.directInvocation,
    vibe: settings.useGroupVibe ? ctx.vibe : null,
    styleSamples: ctx.styleSamples,
    humor: input.humor,
  });
}

/**
 * Social address: "hey jemaw", "you cooking something jemaw?"
 * Skips expense extract; still grounds reply in live pending drafts.
 */
export async function maybeDeliverDirectChat(input: {
  db: Db;
  api: Api;
  group: Group;
  userText: string;
  currency: string;
  humor: HumorRuntime;
}): Promise<void> {
  const started = Date.now();
  const settingsRaw = input.group.settings as Record<string, unknown> | null;
  const settings = parseHumorSettings(settingsRaw?.humor);

  if (settings.mode === "off") {
    console.log(
      `[humor] chat suppressed group=${input.group.id} reason=mode_off`,
    );
    return;
  }

  const utterance = sanitizeAddressedUtterance(input.userText);
  if (!utterance) {
    console.log(
      `[humor] chat suppressed group=${input.group.id} reason=empty_utterance`,
    );
    return;
  }

  const ctx = await loadHumorGroupContext({
    db: input.db,
    groupId: input.group.id,
    settings,
    settingsRaw,
    currency: input.currency,
  });

  const packet = buildDirectChatPacket({
    pendingCount: ctx.pendingCount,
    currency: input.currency,
    draftLabels: ctx.draftLabels,
    drafts: ctx.drafts,
    categories: ctx.categories,
    allowedTargetNames: ctx.allowedTargetNames,
    allowedTargetMemberIds: ctx.allowedTargetMemberIds,
    activeMemberCount: ctx.activeMemberCount,
    vibe: settings.useGroupVibe ? ctx.vibe : null,
    languageHint: ctx.languageHint,
    addressedUtterance: utterance,
  });

  await composeAndSend({
    started,
    db: input.db,
    api: input.api,
    group: input.group,
    settings,
    packet,
    // Social address is always an explicit invocation — no cooldown.
    directInvocation: true,
    vibe: settings.useGroupVibe ? ctx.vibe : null,
    styleSamples: ctx.styleSamples,
    humor: input.humor,
  });
}

async function composeAndSend(input: {
  started: number;
  db: Db;
  api: Api;
  group: Group;
  settings: HumorSettingsV1;
  packet: PublicSafeFactPacket;
  directInvocation: boolean;
  vibe: GroupVibeV1 | null;
  styleSamples: string[];
  humor: HumorRuntime;
}): Promise<void> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, lastAt, recentTexts] = await Promise.all([
    countBotRepliesSince(input.db, input.group.id, dayStart),
    lastBotReplyAt(input.db, input.group.id),
    listRecentBotReplyTexts(input.db, input.group.id, 20),
  ]);

  const composed = await composeHumorReply({
    settings: input.settings,
    factPacket: input.packet,
    nowMs: Date.now(),
    publicRepliesToday,
    lastPublicReplyAtMs: lastAt ? lastAt.getTime() : null,
    directInvocation: input.directInvocation,
    recentReplyTexts: recentTexts,
    humorClient: input.humor.client,
    humorProvider: input.humor.provider,
    humorModel: input.humor.model,
    vibe: input.vibe,
    styleSamples: input.styleSamples,
  });

  if (composed.decision === "do_not_reply") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=${composed.reason} event=${input.packet.event}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: input.packet.event,
      channel: "group",
      decision: "suppressed",
      suppressionReason: composed.reason,
      factPacketRedacted: input.packet,
      factHash: hashPacket(input.packet),
      riskClass: input.packet.risk,
      latencyMs: Date.now() - input.started,
    });
    return;
  }

  try {
    const sent = await input.api.sendMessage(
      Number(input.group.telegramChatId),
      composed.text,
    );
    console.log(
      `[humor] sent group=${input.group.id} source=${composed.source} event=${input.packet.event} text_len=${composed.text.length}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: input.packet.event,
      channel: composed.channel,
      decision: "sent",
      templateId: composed.templateId,
      provider: composed.provider ?? null,
      model: composed.model ?? null,
      promptVersion: composed.promptVersion ?? null,
      factPacketRedacted: input.packet,
      factHash: hashPacket(input.packet),
      candidateTexts: composed.candidates,
      selectedText: composed.text,
      selectedStyle: composed.style,
      riskClass: input.packet.risk,
      telegramMessageId: BigInt(sent.message_id),
      latencyMs: Date.now() - input.started,
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
      triggerEvent: input.packet.event,
      channel: "group",
      decision: "failed",
      suppressionReason:
        err instanceof Error ? err.message.slice(0, 200) : "send_failed",
      selectedText: composed.text,
      factPacketRedacted: input.packet,
      factHash: hashPacket(input.packet),
      latencyMs: Date.now() - input.started,
    });
  }
}

async function loadHumorGroupContext(input: {
  db: Db;
  groupId: string;
  settings: HumorSettingsV1;
  settingsRaw: Record<string, unknown> | null;
  currency: string;
}): Promise<{
  vibe: GroupVibeV1;
  styleSamples: string[];
  draftLabels: string[];
  drafts: Array<{
    label: string;
    amount?: string;
    currency?: string;
    payer_name?: string;
  }>;
  categories: string[];
  allowedTargetNames: string[];
  allowedTargetMemberIds: string[];
  activeMemberCount: number;
  pendingCount: number;
  languageHint: string | undefined;
}> {
  const [members, pending, msgs, prefsMap] = await Promise.all([
    listMembers(input.db, input.groupId),
    listPendingSuggestions(input.db, input.groupId),
    lastNMessages(input.db, input.groupId, 50),
    loadPrefsMap(input.db, input.groupId),
  ]);

  const memberByTg = new Map(
    members.map((m) => [m.telegramUserId.toString(), m]),
  );
  const styleMsgs: StyleSampleMessage[] = msgs.map((m) => {
    const mem = memberByTg.get(m.senderTelegramUserId.toString());
    const prefs = mem ? prefsMap.get(mem.id) : undefined;
    const contribute = !mem || (prefs?.contributeToStyleProfile ?? true);
    return {
      text: m.text,
      sentAt: m.sentAt,
      contribute,
    };
  });

  let vibe = parseGroupVibe(input.settingsRaw?.vibe);
  if (input.settings.useGroupVibe) {
    const features = extractStyleFeatures(styleMsgs);
    vibe = mergeVibeProfile(vibe, features);
    await mergeGroupSettings(input.db, input.groupId, { vibe }).catch((err) =>
      console.warn(`[humor] vibe save failed:`, err?.message ?? err),
    );
  }

  const allowedTargetNames: string[] = [];
  const allowedTargetMemberIds: string[] = [];
  if (
    input.settings.memberTargeting === "consenting_members" &&
    (input.settings.mode === "roast" || input.settings.mode === "chaos")
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

  const memberById = new Map(members.map((m) => [m.id, m]));
  const allowedNameSet = new Set(
    allowedTargetNames.map((n) => n.toLowerCase()),
  );

  const drafts = pending.slice(0, 6).map((s) => {
    let payer_name: string | undefined;
    if (s.payerMemberId) {
      const payer = memberById.get(s.payerMemberId);
      if (payer && allowedNameSet.has(payer.displayName.toLowerCase())) {
        payer_name = payer.displayName;
      }
    }
    return {
      label: s.description,
      amount: s.amount != null ? String(s.amount) : undefined,
      currency: input.currency,
      payer_name,
    };
  });

  const languageHint =
    input.settings.languageMode === "auto"
      ? vibe.languages[0]?.code
      : input.settings.languageMode === "code_mix"
        ? "en+am"
        : input.settings.languageMode;

  return {
    vibe,
    styleSamples: input.settings.useGroupVibe
      ? pickStyleSamples(styleMsgs, 3)
      : [],
    draftLabels,
    drafts,
    categories: uniqueCategories(draftLabels),
    allowedTargetNames,
    allowedTargetMemberIds,
    activeMemberCount: members.filter((m) => m.isActive).length,
    pendingCount: pending.length,
    languageHint,
  };
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
