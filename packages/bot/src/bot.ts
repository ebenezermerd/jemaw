import { Bot, type Context } from "grammy";
import type { Db } from "./db.js";
import {
  upsertGroup,
  getGroupById,
  captureMessage,
  countPendingSuggestions,
  findMemberByTelegramId,
} from "./repo.js";
import { registerUser, seedAdmins } from "./telegram/memberSync.js";
import { ensurePinnedMessage } from "./telegram/pinnedMessage.js";
import type { GeminiClient } from "./ai/geminiClient.js";
import { ScanRateLimiter } from "./ai/rateLimit.js";
import { scanGroup } from "./ai/scan.js";

/** Word-boundary, case-insensitive "jemaw" trigger (plan §10). */
const JEMAW_RE = /(?<![a-z0-9])jemaw(?![a-z0-9])/i;

// ─── Reply copy (pure, testable) ──────────────────────────────────────
export function startGroupText(): string {
  return [
    "Jemaw is here.",
    "",
    'I\'ll listen for the word "jemaw" and suggest expenses from your chat.',
    "Tap the pinned button to open Jemaw and start tracking.",
  ].join("\n");
}

export function startPrivateText(): string {
  return [
    "Jemaw — personal setup.",
    "",
    "You can now receive private review DMs. Add me to a group to start.",
  ].join("\n");
}

export function helpText(): string {
  return [
    "Jemaw — commands",
    "",
    "/jemaw — refresh and scan the recent chat",
    "/balance — show everyone's net position",
    "/settle — open the settle-up plan",
    "/add — add an expense manually",
    "/history — open the history",
    "/help — this message",
  ].join("\n");
}

export interface BotDeps {
  db: Db;
  defaultCurrency: string;
  miniAppUrl: string | undefined;
  /** Present only when GEMINI_API_KEY is set; absent → scans don't run. */
  gemini?: GeminiClient;
}

const GROUP_TYPES = new Set(["group", "supergroup"]);

/** Create the grammY bot with all handlers (Phases 1-3) registered. */
export function createBot(token: string, deps: BotDeps): Bot {
  const bot = new Bot(token);
  const { db, defaultCurrency, miniAppUrl, gemini } = deps;
  const rateLimiter = new ScanRateLimiter();

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
      },
      count,
    ).catch(() => {});
  }

  /**
   * Kick a Gemini scan if allowed (key present + not rate-limited). Fire and
   * forget: errors are recorded in ai_runs, never thrown to the handler.
   */
  function maybeScan(
    api: Context["api"],
    group: { id: string; telegramChatId: bigint },
    triggeredByMemberId: string | null,
    triggerType: "keyword" | "command",
  ): void {
    if (!gemini) return;
    if (!rateLimiter.tryAcquire(group.id)) return;
    void (async () => {
      const g = await getGroupById(db, group.id);
      if (!g) return;
      await scanGroup({ db, gemini, now: () => Date.now() }, g, triggeredByMemberId, triggerType);
      await refreshPinned(api, group.id, Number(group.telegramChatId));
    })().catch(() => {});
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
    await seedAdmins(ctx.api, db, groupId, BigInt(ctx.chat.id)).catch(() => {});
    const group = await getGroupById(db, groupId);
    await ensurePinnedMessage(ctx.api, db, {
      groupId,
      telegramChatId: BigInt(ctx.chat.id),
      existingPinnedMessageId: group?.pinnedMessageId ?? null,
      miniAppUrl,
    }).catch(() => {});
    await ctx.reply(startGroupText());
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
    );
    await refreshPinned(ctx.api, groupId, ctx.chat.id);
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
      const member = ctx.from
        ? await findScanMember(db, groupId, ctx.from.id)
        : null;
      maybeScan(
        ctx.api,
        { id: groupId, telegramChatId: BigInt(chat.id) },
        member,
        "keyword",
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
