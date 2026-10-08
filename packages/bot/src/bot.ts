import { Bot, type Context } from "grammy";
import type { Db } from "./db.js";
import {
  upsertGroup,
  getGroupById,
  captureMessage,
  countPendingSuggestions,
  findMemberByTelegramId,
  setMemberRole,
} from "./repo.js";
import { registerUser, seedAdmins } from "./telegram/memberSync.js";
import { ensurePinnedMessage } from "./telegram/pinnedMessage.js";
import { badgeEvidence } from "./telegram/reactions.js";
import { sendDigestNow } from "./telegram/weeklyJob.js";
import type { GeminiClient } from "./ai/geminiClient.js";
import type { ScanRateLimiter } from "./ai/rateLimit.js";
import { scanGroup, type ScanResult } from "./ai/scan.js";
import {
  maybeDeliverDirectChat,
  maybeDeliverScanHumor,
  type HumorRuntime,
} from "./ai/humor/deliver.js";
import {
  classifyJemawIntent,
  chatLoadingTopic,
  parseLedgerQuery,
  type JemawIntent,
  type LedgerQuery,
} from "./ai/humor/intent.js";
import { parseHumorSettings } from "@jemaw/shared/humor";
import { deliverLedgerAnswer } from "./ai/ledger/deliver.js";
import { understandMessage, type Understanding } from "./ai/ledger/understand.js";
import {
  CORRECTION_LINES,
  recallLedgerQuestion,
  rememberLedgerQuestion,
  type RememberedQuestion,
} from "./ai/ledger/memory.js";
import { startLoading, type LoadingHandle, type LoadingTopic } from "./telegram/loading.js";

/** Word-boundary, case-insensitive "jemaw" trigger (plan §10). */
const JEMAW_RE = /(?<![a-z0-9])jemaw(?![a-z0-9])/i;

// ─── Reply copy (pure, testable) ──────────────────────────────────────
/** Fallback reply, used only when the pinned message can't be posted. */
export function startGroupText(): string {
  return "Jemaw, your group's quiet bookkeeper.";
}

export function startPrivateText(): string {
  return [
    "Jemaw personal setup.",
    "",
    "You can now receive private review DMs. Add me to a group to start.",
  ].join("\n");
}

export function helpText(): string {
  return [
    "Jemaw commands",
    "",
    "/jemaw: refresh and scan the recent chat",
    "/balance: who owes whom right now",
    "/history: the latest expenses",
    "/digest: post the weekly summary now",
    "/help: this message",
    "",
    "Or just ask: \"jemaw how much do I owe?\", \"jemaw list this week's expenses\", \"jemaw who spent the most?\"",
  ].join("\n");
}

/** Plain scan outcome, used when humor is off or has nothing to add. */
export function scanResultLine(res: ScanResult): string {
  if (res.status === "api_error" || res.status === "parse_error") {
    return "🫠 My scanner tripped over something. Try again in a bit.";
  }
  const s = (n: number) => (n === 1 ? "" : "s");
  if (res.written > 0) {
    return `Found ${res.written} new draft${s(res.written)}. ${res.pendingCount} waiting for review in the app.`;
  }
  if (res.pendingCount > 0) {
    return `Nothing new. ${res.pendingCount} draft${s(res.pendingCount)} still waiting for review.`;
  }
  return "Nothing new to record.";
}

/**
 * Keyword fallback for when the model can't be asked. A complaint is redone
 * as the previous question, sharpened by anything new in the complaint.
 */
export function understandByRules(
  text: string,
  previous: RememberedQuestion | null,
): Understanding {
  const intent: JemawIntent = classifyJemawIntent(text, { hasPrevious: previous != null });
  if (intent === "ledger") return { intent, query: parseLedgerQuery(text) };
  if (intent === "correction" && previous) {
    const q = parseLedgerQuery(text);
    if (q.kind === "overview") return { intent, query: previous.query };
    return {
      intent,
      query: {
        ...previous.query,
        kind: q.kind,
        mine: q.mine ?? previous.query.mine,
        ...(q.days ? { days: q.days, limit: undefined } : {}),
        ...(q.limit ? { limit: q.limit, days: undefined } : {}),
      },
    };
  }
  return { intent: intent === "correction" ? "chat" : intent };
}

const RATE_LIMITED_LINES = [
  "Easy. I literally just checked. Give me 10 seconds.",
  "I'm still blinking from the last scan. Ten seconds, please.",
  "Patience. Even ghosts need a breather between scans.",
];

export interface BotDeps {
  db: Db;
  defaultCurrency: string;
  miniAppUrl: string | undefined;
  botUsername: string | undefined;
  miniAppShortName: string | undefined;
  /** Present only when GEMINI_API_KEY is set; absent → scans don't run. */
  gemini?: GeminiClient;
  scanLimiter: ScanRateLimiter;
  /** Optional Phase 1–2 humor composer client (usually same keys as scan). */
  humor?: HumorRuntime;
}

const GROUP_TYPES = new Set(["group", "supergroup"]);

/** Create the grammY bot with all handlers (Phases 1-3) registered. */
export function createBot(token: string, deps: BotDeps): Bot {
  const bot = new Bot(token);
  const {
    db,
    defaultCurrency,
    miniAppUrl,
    botUsername,
    miniAppShortName,
    gemini,
    scanLimiter,
    humor,
  } = deps;

  // Error boundary, registered first. A failed Telegram call (say, a user who
  // blocked the bot) must not fail the webhook: Telegram would retry that
  // update forever. Logs a short line, never the context, which holds the token.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.warn(`[bot] update failed:`, err instanceof Error ? err.message : err);
    }
  });

  /** Refresh the pinned button so it reflects the current suggestion count. */
  async function refreshPinned(
    api: Context["api"],
    groupId: string,
    chatId: number,
  ): Promise<void> {
    const group = await getGroupById(db, groupId);
    const count = await countPendingSuggestions(db, groupId).catch(() => 0);
    await ensurePinnedMessage(
      api,
      db,
      {
        groupId,
        telegramChatId: BigInt(chatId),
        existingPinnedMessageId: group?.pinnedMessageId ?? null,
        miniAppUrl,
        botUsername,
        miniAppShortName,
      },
      count,
      { createIfMissing: false },
    ).catch(() => {});
  }

  /**
   * Kick a Gemini scan if allowed (key present + not rate-limited). Fire and
   * forget: errors are recorded in ai_runs, never thrown to the handler. Logs
   * every branch so a silent skip/failure is visible in Cloud Run logs.
   */
  function maybeScan(
    api: Context["api"],
    group: { id: string; telegramChatId: bigint },
    triggeredByMemberId: string | null,
    triggerType: "keyword" | "command",
    replyTo?: number,
    existingLoading?: LoadingHandle,
  ): void {
    const chatId = Number(group.telegramChatId);
    if (!gemini) {
      console.log(`[scan] skipped: GEMINI_API_KEY not configured`);
      void existingLoading?.cancel();
      return;
    }
    if (!scanLimiter.tryAcquire(group.id)) {
      console.log(`[scan] rate-limited for group ${group.id}`);
      const line = RATE_LIMITED_LINES[Math.floor(Math.random() * RATE_LIMITED_LINES.length)]!;
      if (existingLoading) {
        void existingLoading.finish(line);
        return;
      }
      void api
        .sendMessage(
          chatId,
          line,
          replyTo != null
            ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }
            : {},
        )
        .catch(() => {});
      return;
    }
    console.log(`[scan] triggered (${triggerType}) for group ${group.id}`);
    void (async () => {
      const g = await getGroupById(db, group.id);
      if (!g) {
        console.log(`[scan] group ${group.id} not found`);
        return;
      }
      const loading =
        existingLoading ?? (await startLoading(api, chatId, { topic: "scan", replyTo }));
      const res = await scanGroup(
        { db, gemini: gemini!, now: () => Date.now() },
        g,
        triggeredByMemberId,
        triggerType,
      );
      console.log(
        `[scan] done: status=${res.status} written=${res.written} pending=${res.pendingCount}`,
      );
      // Badge the source messages the AI used, so the chat shows it noticed.
      await badgeEvidence(
        api,
        Number(group.telegramChatId),
        res.evidenceMessageIds,
      );
      await refreshPinned(api, group.id, Number(group.telegramChatId));
      // Humor edits the placeholder; when it stays quiet, say the plain outcome.
      const delivered = await maybeDeliverScanHumor({
        db,
        api,
        group: g,
        written: res.written,
        pendingCount: res.pendingCount,
        scanStatus: res.status,
        directInvocation:
          triggerType === "keyword" || triggerType === "command",
        currency: g.defaultCurrency,
        humor: humor ?? {},
        loading,
      }).catch((err) => {
        console.warn(`[humor] after scan failed:`, err?.message ?? err);
        return false;
      });
      if (!delivered) await loading.finish(scanResultLine(res));
    })().catch((err) =>
      console.error(`[scan] failed:`, err?.message ?? err),
    );
  }

  /** Answer a ledger question with exact figures behind a funny placeholder. */
  function answerLedger(
    ctx: Context,
    groupId: string,
    query: LedgerQuery,
    opts: { loading?: LoadingHandle; lead?: string; questionText?: string } = {},
  ): void {
    const chatId = ctx.chat!.id;
    const replyTo = ctx.message?.message_id;
    const askerTelegramId = ctx.from ? BigInt(ctx.from.id) : null;
    void (async () => {
      const g = await getGroupById(db, groupId);
      if (!g) {
        await opts.loading?.cancel();
        return;
      }
      if (opts.questionText) {
        rememberLedgerQuestion(groupId, askerTelegramId, opts.questionText, query);
      }
      const loading =
        opts.loading ?? (await startLoading(ctx.api, chatId, { topic: query.kind, replyTo }));
      await deliverLedgerAnswer({
        db,
        group: g,
        askerTelegramId,
        query,
        loading,
        humor: humor ?? {},
        lead: opts.lead,
      });
    })().catch((err) =>
      console.warn(`[ledger] answer failed:`, err instanceof Error ? err.message : err),
    );
  }

  async function ensureGroup(ctx: Context): Promise<string | null> {
    const chat = ctx.chat;
    if (!chat || !GROUP_TYPES.has(chat.type)) return null;
    const name = "title" in chat && chat.title ? chat.title : "Group";
    const group = await upsertGroup(
      db,
      BigInt(chat.id),
      name,
      defaultCurrency,
    );
    return group.id;
  }

  // Bot added to / status changed in a chat → register the group + admins.
  bot.on("my_chat_member", async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === "member" || status === "administrator") {
      const groupId = await ensureGroup(ctx);
      if (groupId && ctx.chat) {
        await seedAdmins(ctx.api, db, groupId, BigInt(ctx.chat.id)).catch(
          () => {},
        );
      }
    }
  });

  bot.command("start", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await ctx.reply(startPrivateText());
      return;
    }
    const groupId = await ensureGroup(ctx);
    if (!groupId || !ctx.chat) {
      await ctx.reply(startGroupText());
      return;
    }
    if (ctx.from) await registerUser(db, groupId, ctx.from);
    const seeded = await seedAdmins(
      ctx.api,
      db,
      groupId,
      BigInt(ctx.chat.id),
    ).catch(() => false);
    // Fallback: if we couldn't read any admin from Telegram, make the person who
    // ran /start an admin so the group always has at least one.
    if (!seeded && ctx.from) {
      await setMemberRole(db, groupId, BigInt(ctx.from.id), "admin").catch(
        () => {},
      );
    }
    const group = await getGroupById(db, groupId);
    await ensurePinnedMessage(ctx.api, db, {
      groupId,
      telegramChatId: BigInt(ctx.chat.id),
      existingPinnedMessageId: group?.pinnedMessageId ?? null,
      miniAppUrl,
      botUsername,
      miniAppShortName,
    }).catch((err) =>
      // Don't crash /start, but DO log — a silent pin failure hid a real bug.
      console.error("ensurePinnedMessage failed:", err?.message ?? err),
    );
    // Success posts only the pinned message — no extra chat copy.
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpText());
  });

  // /jemaw — refresh the pinned button and kick a scan.
  bot.command("jemaw", async (ctx) => {
    const groupId = await ensureGroup(ctx);
    if (!groupId || !ctx.chat) return;
    if (ctx.from) await registerUser(db, groupId, ctx.from).catch(() => {});
    const member = ctx.from
      ? await findScanMember(db, groupId, ctx.from.id)
      : null;
    maybeScan(
      ctx.api,
      { id: groupId, telegramChatId: BigInt(ctx.chat.id) },
      member,
      "command",
      ctx.message?.message_id,
    );
    await refreshPinned(ctx.api, groupId, ctx.chat.id);
  });

  // /balance and /history — ledger answers without typing a question.
  bot.command("balance", async (ctx) => {
    const groupId = await ensureGroup(ctx);
    if (!groupId || !ctx.chat) return;
    if (ctx.from) await registerUser(db, groupId, ctx.from).catch(() => {});
    answerLedger(ctx, groupId, { kind: "who_owes", period: "all" });
  });

  bot.command("history", async (ctx) => {
    const groupId = await ensureGroup(ctx);
    if (!groupId || !ctx.chat) return;
    answerLedger(ctx, groupId, { kind: "expense_list", period: "all" });
  });

  // /digest — post the weekly summary on demand and restart its weekly clock.
  bot.command("digest", async (ctx) => {
    const groupId = await ensureGroup(ctx);
    if (!groupId || !ctx.chat) return;
    const group = await getGroupById(db, groupId);
    if (!group) return;
    try {
      const result = await sendDigestNow(
        { db, api: ctx.api, gemini },
        group,
      );
      if (result === "quiet") {
        await ctx.reply("Nothing recorded in the last 7 days, so no summary to post.");
      }
    } catch (err) {
      console.warn(
        `[digest] /digest failed: ${err instanceof Error ? err.message : err}`,
      );
      await ctx.reply("Couldn't build the summary right now. Try again shortly.");
    }
  });

  // Capture plain group text + register the speaker; trigger a scan on "jemaw".
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;
    if (!chat || !GROUP_TYPES.has(chat.type)) return;
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // commands handled above
    const groupId = await ensureGroup(ctx);
    if (!groupId) return;
    if (ctx.from) await registerUser(db, groupId, ctx.from).catch(() => {});
    await captureMessage(
      db,
      groupId,
      BigInt(ctx.message.message_id),
      BigInt(ctx.from?.id ?? 0),
      text,
      new Date(ctx.message.date * 1000),
    ).catch(() => {});

    if (JEMAW_RE.test(text)) {
      const askerTelegramId = ctx.from ? BigInt(ctx.from.id) : null;
      const replyTo = ctx.message.message_id;
      void (async () => {
        const g = await getGroupById(db, groupId);
        if (!g) return;
        const previous = recallLedgerQuestion(groupId, askerTelegramId);
        const byRules = understandByRules(text, previous);
        const mode = parseHumorSettings(
          (g.settings as Record<string, unknown> | null)?.humor,
        ).mode;
        // Humor off and plainly social: stay quiet, as before.
        if (byRules.intent === "chat" && mode === "off") return;

        // Placeholder first, from the fast rules; the model refines the route.
        const topic: LoadingTopic =
          byRules.query?.kind ?? (byRules.intent === "chat" ? chatLoadingTopic(text) : "scan");
        const loading = await startLoading(ctx.api, chat.id, { topic, replyTo });

        const understander = humor?.client ?? gemini;
        const byModel = understander
          ? await understandMessage({
              client: understander,
              text,
              previous: previous ? { text: previous.text, kind: previous.query.kind } : undefined,
            })
          : null;
        const u = byModel ?? byRules;
        console.log(
          `[understand] group=${groupId} intent=${u.intent} source=${byModel ? "model" : "rules"} query=${JSON.stringify(u.query ?? null)}`,
        );

        if ((u.intent === "ledger" || u.intent === "correction") && u.query) {
          const correcting = u.intent === "correction" && previous != null;
          answerLedger(ctx, groupId, u.query, {
            loading,
            questionText: correcting && previous ? previous.text : text,
            lead: correcting
              ? CORRECTION_LINES[Math.floor(Math.random() * CORRECTION_LINES.length)]
              : undefined,
          });
          return;
        }
        if (u.intent === "scan") {
          const member = ctx.from ? await findScanMember(db, groupId, ctx.from.id) : null;
          maybeScan(
            ctx.api,
            { id: groupId, telegramChatId: BigInt(chat.id) },
            member,
            "keyword",
            replyTo,
            loading,
          );
          return;
        }
        // Social banter: reply from live DB context.
        if (mode === "off") {
          await loading.cancel();
          return;
        }
        const delivered = await maybeDeliverDirectChat({
          db,
          api: ctx.api,
          group: g,
          userText: text,
          currency: g.defaultCurrency,
          humor: humor ?? {},
          askerTelegramId,
          loading,
        });
        if (!delivered) await loading.cancel();
      })().catch((err) =>
        console.warn(
          `[jemaw] reply failed:`,
          err instanceof Error ? err.message : err,
        ),
      );
    }
  });

  return bot;
}

/** Resolve a Telegram user to a member id for ai_runs attribution. */
async function findScanMember(
  db: Db,
  groupId: string,
  telegramUserId: number,
): Promise<string | null> {
  const m = await findMemberByTelegramId(db, groupId, BigInt(telegramUserId));
  return m?.id ?? null;
}
