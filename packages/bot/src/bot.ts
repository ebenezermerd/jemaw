import { Bot, type Context } from "grammy";
import type { Db } from "./db.js";
import {
  upsertGroup,
  getGroupById,
  captureMessage,
} from "./repo.js";
import { registerUser, seedAdmins } from "./telegram/memberSync.js";
import { ensurePinnedMessage } from "./telegram/pinnedMessage.js";

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
}

const GROUP_TYPES = new Set(["group", "supergroup"]);

/** Create the grammY bot with Phase 1 handlers registered. */
export function createBot(token: string, deps: BotDeps): Bot {
  const bot = new Bot(token);
  const { db, defaultCurrency, miniAppUrl } = deps;

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

  // Capture plain group text + register the speaker (see-as-they-speak).
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
  });

  return bot;
}
