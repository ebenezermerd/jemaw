import type { FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";

const WEBHOOK_PATH = "/telegram/webhook";

/**
 * Mount the Telegram webhook route on Fastify and register it with Telegram.
 * Used only when BOT_MODE=webhook (prod). Local dev uses polling instead.
 */
export async function mountWebhook(
  app: FastifyInstance,
  bot: Bot,
  webhookBaseUrl: string,
): Promise<void> {
  const handler = webhookCallback(bot, "fastify");
  app.post(WEBHOOK_PATH, handler);

  await bot.init();
  const url = new URL(WEBHOOK_PATH, webhookBaseUrl).toString();
  await bot.api.setWebhook(url);
}
