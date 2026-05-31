import { loadEnv } from "./env.js";
import { createDb } from "./db.js";
import { createBot } from "./bot.js";
import { buildServer } from "./server.js";
import { mountWebhook } from "./webhook.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  // Default currency for groups created in Phase 1 (per-group currency picker
  // arrives with onboarding UI; EUR is the v1 default).
  const defaultCurrency = "EUR";

  const bot = createBot(env.TELEGRAM_BOT_TOKEN, {
    db,
    defaultCurrency,
    miniAppUrl: env.MINI_APP_URL,
  });

  const app = await buildServer({
    api: {
      db,
      botToken: env.TELEGRAM_BOT_TOKEN,
      now: () => Math.floor(Date.now() / 1000),
    },
    corsOrigin: env.MINI_APP_URL,
  });

  if (env.BOT_MODE === "webhook") {
    if (!env.WEBHOOK_URL) throw new Error("WEBHOOK_URL required in webhook mode");
    await mountWebhook(app, bot, env.WEBHOOK_URL);
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Bot in webhook mode, listening on :${env.PORT}`);
  } else {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Bot in polling mode, /health on :${env.PORT}`);
    void bot.start({
      onStart: (me) => app.log.info(`Polling as @${me.username}`),
    });
  }

  const shutdown = async () => {
    await bot.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
