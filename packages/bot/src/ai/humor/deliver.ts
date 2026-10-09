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
import type { LoadingHandle } from "../../telegram/loading.js";
import { cleanReplyPunctuation } from "./punctuation.js";
import { postContext, type PostLinks } from "../../telegram/postLinks.js";
import { groupDigits } from "../../telegram/announcements.js";
import { buildLedgerSnapshot, ledgerHighlights } from "../ledger/snapshot.js";
import {
  buildDirectChatPacket,
  buildScanOutcomePacket,
} from "./factPacket.js";
import { composeHumorReply } from "./service.js";
import { JEMAW_MENTION_RE, sanitizeAddressedUtterance } from "./intent.js";
import { bossToneRule, endsPause } from "./boss.js";
import type { BossTone } from "@jemaw/shared/boss";
import {
  buildConversationFlow,
  isChatSulking,
} from "./conversationFlow.js";
import { buildThreadTurns } from "./threadMemory.js";
import {
  CHAT_SULK_MINUTES,
  HUMOR_MODE_LIMITS,
  type HumorMode,
} from "@jemaw/shared/humor";
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
  listRecentBotReplies,
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
  /** Placeholder to edit into the reply instead of sending a new message. */
  loading?: LoadingHandle;
}): Promise<boolean> {
  const started = Date.now();
  const settingsRaw = input.group.settings as Record<string, unknown> | null;
  const settings = parseHumorSettings(settingsRaw?.humor);

  if (settings.mode === "off") {
    console.log(`[humor] suppressed group=${input.group.id} reason=mode_off`);
    return false;
  }

  if (input.scanStatus !== "success" && input.scanStatus !== "no_messages") {
    console.log(
      `[humor] suppressed group=${input.group.id} reason=scan_status_${input.scanStatus}`,
    );
    return false;
  }

  const ctx = await loadHumorGroupContext({
    db: input.db,
    groupId: input.group.id,
    settings,
    settingsRaw,
    currency: input.currency,
  });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, recentTexts] = await Promise.all([
    countBotRepliesSince(input.db, input.group.id, dayStart),
    listRecentBotReplyTexts(input.db, input.group.id, 8),
  ]);
  const maxDay = maxRepliesForMode(settings.mode, settings.maxPublicRepliesPerDay);
  const flow = buildConversationFlow({
    kind: "scan",
    pendingCount: input.pendingCount || ctx.pendingCount,
    pokeCount1h: ctx.pokeCount1h,
    recentBotTexts: recentTexts,
    publicRepliesToday,
    maxPublicRepliesPerDay: maxDay,
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
    conversationFlow: flow,
  });

  return composeAndSend({
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
    prefetched: { publicRepliesToday, recentTexts },
    loading: input.loading,
  });
}

/**
 * Social address: "hey jemaw", "you cooking something jemaw?"
 * Skips expense extract; grounds reply in live drafts + recent thread.
 * After hard_nudge, enforces chat sulk (silence) until backlog moves.
 */
export async function maybeDeliverDirectChat(input: {
  db: Db;
  api: Api;
  group: Group;
  userText: string;
  currency: string;
  humor: HumorRuntime;
  /** Telegram id of whoever addressed Jemaw, so the reply knows who it's talking to. */
  askerTelegramId?: bigint | null;
  /** Placeholder to edit into the reply instead of sending a new message. */
  loading?: LoadingHandle;
  /** Where the app opens, for the button under a going-quiet warning. */
  links?: PostLinks;
  /** Set when a super admin is talking: how to treat them. */
  boss?: { tone: BossTone; skipPause: boolean; canEndPause: boolean };
  /** Every super admin's Telegram id; their mentions don't count toward the pause. */
  bossIds?: string[];
}): Promise<boolean> {
  const started = Date.now();
  const settingsRaw = input.group.settings as Record<string, unknown> | null;
  let settings = parseHumorSettings(settingsRaw?.humor);

  if (settings.mode === "off") {
    console.log(
      `[humor] chat suppressed group=${input.group.id} reason=mode_off`,
    );
    return false;
  }

  const utterance = sanitizeAddressedUtterance(input.userText);
  if (!utterance) {
    console.log(
      `[humor] chat suppressed group=${input.group.id} reason=empty_utterance`,
    );
    return false;
  }

  const ctx = await loadHumorGroupContext({
    db: input.db,
    groupId: input.group.id,
    settings,
    settingsRaw,
    currency: input.currency,
    ignoreSenders: input.bossIds,
  });

  // Enforce prior ultimatum: stay quiet unless backlog improved.
  const sulk = isChatSulking({
    chatSulkUntil: settings.chatSulkUntil,
    chatSulkPendingCount: settings.chatSulkPendingCount,
    pendingCount: ctx.pendingCount,
  });
  if (sulk.shouldClear) {
    settings = await clearChatSulk(input.db, input.group.id, settings);
    if (sulk.reason === "backlog_improved") {
      console.log(
        `[humor] sulk cleared group=${input.group.id} reason=backlog_improved`,
      );
    }
  } else if (sulk.sulking && input.boss?.canEndPause && endsPause(utterance)) {
    // The boss calls it off: the pause ends for everyone.
    settings = await clearChatSulk(input.db, input.group.id, settings);
    console.log(`[humor] sulk cleared group=${input.group.id} reason=boss`);
  } else if (sulk.sulking && input.boss?.skipPause) {
    console.log(`[humor] sulk skipped for boss group=${input.group.id}`);
  } else if (sulk.sulking) {
    console.log(
      `[humor] chat suppressed group=${input.group.id} reason=chat_sulk pending=${ctx.pendingCount}`,
    );
    await insertBotReply(input.db, {
      groupId: input.group.id,
      triggerEvent: "direct_mention",
      channel: "group",
      decision: "suppressed",
      suppressionReason: "chat_sulk",
      riskClass: "green",
      latencyMs: Date.now() - started,
    });
    return false;
  }

  const ledger = await buildLedgerSnapshot(
    input.db,
    input.group,
    input.askerTelegramId ?? null,
  ).catch((err) => {
    console.warn(`[humor] ledger snapshot failed:`, err instanceof Error ? err.message : err);
    return null;
  });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, recentReplies] = await Promise.all([
    countBotRepliesSince(input.db, input.group.id, dayStart),
    listRecentBotReplies(input.db, input.group.id, 10),
  ]);
  const recentTexts = recentReplies.map((r) => r.text);
  const maxDay = maxRepliesForMode(settings.mode, settings.maxPublicRepliesPerDay);

  const threadTurns = buildThreadTurns({
    messages: ctx.recentMessages,
    botReplies: recentReplies.map((r) => ({
      text: r.text,
      createdAt: r.createdAt,
    })),
    maxTurns: 8,
  });
  // Ensure current utterance is last user turn (capture may race).
  if (
    !threadTurns.length ||
    threadTurns[threadTurns.length - 1]!.role !== "user" ||
    threadTurns[threadTurns.length - 1]!.text !== utterance.slice(0, 140)
  ) {
    threadTurns.push({ role: "user", text: utterance.slice(0, 140) });
    while (threadTurns.length > 8) threadTurns.shift();
  }

  const flow = buildConversationFlow({
    kind: "chat",
    pendingCount: ctx.pendingCount,
    // A boss who skips the pause is never nudged toward it either.
    pokeCount1h: input.boss?.skipPause ? Math.min(ctx.pokeCount1h, 1) : ctx.pokeCount1h,
    recentBotTexts: recentTexts,
    publicRepliesToday,
    maxPublicRepliesPerDay: maxDay,
    userText: utterance,
  });

  // Continuity directive when we have prior turns.
  if (threadTurns.length >= 2) {
    flow.directive =
      `Continue the ongoing thread (${threadTurns.length} prior lines). ` +
      flow.directive;
  }

  const bossRule = bossToneRule(input.boss?.tone, ledger?.asker?.name);
  if (bossRule) flow.directive = `${flow.directive} ${bossRule}`;

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
    conversationFlow: flow,
    threadTurns,
    addressedBy: ledger?.asker?.name,
    ledger: ledger && settings.ledgerBanter ? ledgerHighlights(ledger) : undefined,
  });

  console.log(
    `[humor] chat_flow group=${input.group.id} phase=${flow.phase} money=${flow.money_mention} pokes_1h=${flow.poke_count_1h} thread=${threadTurns.length} sulk_after=${flow.will_sulk_after === true}`,
  );

  return composeAndSend({
    started,
    db: input.db,
    api: input.api,
    group: input.group,
    settings,
    packet,
    directInvocation: true,
    vibe: settings.useGroupVibe ? ctx.vibe : null,
    styleSamples: ctx.styleSamples,
    humor: input.humor,
    prefetched: { publicRepliesToday, recentTexts },
    applySulkIfHardNudge: !input.boss,
    pendingCountForSulk: ctx.pendingCount,
    sulkDrafts: ctx.drafts,
    openUrl: postContext(input.links, input.group.id).openUrl,
    loading: input.loading,
  });
}

/**
 * The serious last word before chat goes quiet. The jokes come in the pokes
 * before it; this one is written by code so it always says what is waiting,
 * what to do, until when, and that money questions still work.
 */
export function sulkWarning(input: {
  pendingCount: number;
  drafts: { label: string; amount?: string; currency?: string }[];
  until: Date;
}): string {
  const first = input.drafts[0];
  const waiting =
    input.pendingCount === 1 && first
      ? `1 expense is waiting for approval: ${first.label}${first.amount ? ` · ${formatAmount(first.amount)}${first.currency ? ` ${first.currency}` : ""}` : ""}.`
      : `${input.pendingCount} expenses are waiting for approval.`;
  const it = input.pendingCount === 1 ? "it" : "them";
  const time = input.until.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
  });
  return [
    `Okay, serious now. ${waiting}`,
    `⏸ I'm pausing chat until ${time} (${CHAT_SULK_MINUTES} minutes). Approve or dismiss ${it} in the app and I'm back right away.`,
    "Money questions still get answered.",
  ].join("\n\n");
}

function formatAmount(amount: string): string {
  return groupDigits(amount.replace(/\.00$/, ""));
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
  prefetched?: { publicRepliesToday: number; recentTexts: string[] };
  /** After hard_nudge send, arm chat sulk so threats have teeth. */
  applySulkIfHardNudge?: boolean;
  pendingCountForSulk?: number;
  sulkDrafts?: { label: string; amount?: string; currency?: string }[];
  openUrl?: string | null;
  loading?: LoadingHandle;
}): Promise<boolean> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [publicRepliesToday, lastAt, recentTexts] = await Promise.all([
    input.prefetched
      ? Promise.resolve(input.prefetched.publicRepliesToday)
      : countBotRepliesSince(input.db, input.group.id, dayStart),
    lastBotReplyAt(input.db, input.group.id),
    input.prefetched
      ? Promise.resolve(input.prefetched.recentTexts)
      : listRecentBotReplyTexts(input.db, input.group.id, 20),
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
    return false;
  }

  const willSulk =
    input.applySulkIfHardNudge === true &&
    input.packet.conversation_flow?.will_sulk_after === true &&
    (input.pendingCountForSulk ?? 0) > 0;
  const text = willSulk
    ? sulkWarning({
        pendingCount: input.pendingCountForSulk ?? 0,
        drafts: input.sulkDrafts ?? [],
        until: new Date(Date.now() + CHAT_SULK_MINUTES * 60_000),
      })
    : cleanReplyPunctuation(composed.text);
  const sendOpts =
    willSulk && input.openUrl
      ? { reply_markup: { inline_keyboard: [[{ text: "Review in Jemaw", url: input.openUrl }]] } }
      : {};
  try {
    const messageId = input.loading
      ? await input.loading.finish(text, sendOpts)
      : (await input.api.sendMessage(Number(input.group.telegramChatId), text, sendOpts)).message_id;
    if (messageId == null) throw new Error("send_failed");
    console.log(
      `[humor] sent group=${input.group.id} source=${composed.source} event=${input.packet.event} text_len=${text.length}`,
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
      selectedText: text,
      selectedStyle: composed.style,
      riskClass: input.packet.risk,
      telegramMessageId: BigInt(messageId),
      latencyMs: Date.now() - input.started,
      inputTokens: composed.inputTokens ?? null,
      outputTokens: composed.outputTokens ?? null,
    });

    // Ultimatum has teeth: social chat goes quiet until backlog moves or timer ends.
    if (willSulk) {
      await armChatSulk(
        input.db,
        input.group.id,
        input.settings,
        input.pendingCountForSulk ?? 0,
      );
      console.log(
        `[humor] chat_sulk armed group=${input.group.id} minutes=${CHAT_SULK_MINUTES} pending=${input.pendingCountForSulk}`,
      );
    }
    return true;
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
      selectedText: text,
      factPacketRedacted: input.packet,
      factHash: hashPacket(input.packet),
      latencyMs: Date.now() - input.started,
    });
    return false;
  }
}

async function loadHumorGroupContext(input: {
  db: Db;
  groupId: string;
  settings: HumorSettingsV1;
  settingsRaw: Record<string, unknown> | null;
  currency: string;
  /** Telegram ids whose mentions don't count as pokes (the bosses). */
  ignoreSenders?: string[];
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
  /** Messages in the last hour that address jemaw. */
  pokeCount1h: number;
  /** Recent raw messages for thread building. */
  recentMessages: Array<{ text: string; sentAt: Date }>;
}> {
  const [members, pending, msgs, prefsMap] = await Promise.all([
    listMembers(input.db, input.groupId),
    listPendingSuggestions(input.db, input.groupId),
    lastNMessages(input.db, input.groupId, 80),
    loadPrefsMap(input.db, input.groupId),
  ]);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const ignored = new Set(input.ignoreSenders ?? []);
  const pokeCount1h = msgs.filter(
    (m) =>
      m.sentAt.getTime() >= hourAgo &&
      !ignored.has(String(m.senderTelegramUserId)) &&
      JEMAW_MENTION_RE.test(m.text),
  ).length;
  const recentMessages = msgs.map((m) => ({ text: m.text, sentAt: m.sentAt }));

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
  if (input.settings.ledgerBanter) {
    // Ledger banter names everyone; the group switch is the only gate.
    for (const m of members.filter((x) => x.isActive)) {
      allowedTargetNames.push(m.displayName);
      allowedTargetMemberIds.push(m.id);
    }
  } else if (
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
    pokeCount1h,
    recentMessages,
  };
}

function maxRepliesForMode(mode: HumorMode, settingsMax: number): number {
  if (mode === "off") return settingsMax;
  const limits = HUMOR_MODE_LIMITS[mode];
  return settingsMax || limits.maxPublicRepliesPerDay;
}

async function armChatSulk(
  db: Db,
  groupId: string,
  settings: HumorSettingsV1,
  pendingCount: number,
): Promise<void> {
  const until = new Date(
    Date.now() + CHAT_SULK_MINUTES * 60_000,
  ).toISOString();
  const next: HumorSettingsV1 = {
    ...settings,
    chatSulkUntil: until,
    chatSulkPendingCount: pendingCount,
  };
  await mergeGroupSettings(db, groupId, { humor: next });
}

async function clearChatSulk(
  db: Db,
  groupId: string,
  settings: HumorSettingsV1,
): Promise<HumorSettingsV1> {
  const next: HumorSettingsV1 = {
    ...settings,
    chatSulkUntil: undefined,
    chatSulkPendingCount: undefined,
  };
  await mergeGroupSettings(db, groupId, { humor: next });
  return next;
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
