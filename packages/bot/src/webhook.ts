import type { FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";

export const WEBHOOK_PATH = "/telegram/webhook";

/**
 * Mount the Telegram webhook route on Fastify. Must run BEFORE app.listen so
 * the route exists when Telegram delivers updates. Does not contact Telegram.
 */
export function mountWebhookRoute(app: FastifyInstance, bot: Bot): void {
  const handler = webhookCallback(bot, "fastify");
  app.post(WEBHOOK_PATH, handler);
}

/**
 * Register the webhook URL with Telegram. Runs AFTER the server is listening so
 * a transient setWebhook failure cannot stop the container from passing its
 * health check. Returns the registered URL, or null on failure (logged).
 */
export async function registerWebhook(
  bot: Bot,
  webhookBaseUrl: string,
  log: (msg: string) => void,
): Promise<string | null> {
  try {
    await bot.init();
    const url = new URL(WEBHOOK_PATH, webhookBaseUrl).toString();
    await bot.api.setWebhook(url);
    return url;
  } catch (err) {
    log(
      `setWebhook failed (server still up): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
