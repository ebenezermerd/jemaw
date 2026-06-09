import { loadEnv } from "./env.js";
import { createDb } from "./db.js";
import { createBot } from "./bot.js";
import { buildServer } from "./server.js";
import { mountWebhookRoute, registerWebhook } from "./webhook.js";
import {
  createGeminiClient,
  createGroqClient,
  withFallback,
  type ScanClient,
} from "./ai/geminiClient.js";
import { ScanRateLimiter } from "./ai/rateLimit.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb({
    databaseUrl: env.DATABASE_URL,
    instanceConnectionName: env.INSTANCE_CONNECTION_NAME,
  });

  // Default currency for groups created in Phase 1 (per-group currency picker
  // arrives with onboarding UI; EUR is the v1 default).
  const defaultCurrency = "EUR";

  // Scan client: Groq preferred (fast), Gemini fallback. Either alone works.
  const groq = env.GROQ_API_KEY
    ? createGroqClient(env.GROQ_API_KEY, env.GROQ_MODEL)
    : undefined;
  const geminiOnly = env.GEMINI_API_KEY
    ? createGeminiClient(env.GEMINI_API_KEY)
    : undefined;
  const gemini: ScanClient | undefined =
    groq && geminiOnly
      ? withFallback(groq, geminiOnly)
      : (groq ?? geminiOnly);
  if (groq) console.log(`[scan] using Groq${geminiOnly ? " (Gemini fallback)" : ""}`);
  else if (geminiOnly) console.log(`[scan] using Gemini`);
  else console.log(`[scan] no AI key configured — scans disabled`);
  const scanLimiter = new ScanRateLimiter();

  const bot = createBot(env.TELEGRAM_BOT_TOKEN, {
    db,
    defaultCurrency,
    miniAppUrl: env.MINI_APP_URL,
    botUsername: env.BOT_USERNAME,
    miniAppShortName: env.MINI_APP_SHORT_NAME,
    gemini,
    scanLimiter,
  });

  const app = await buildServer({
    api: {
      db,
      botToken: env.TELEGRAM_BOT_TOKEN,
      now: () => Math.floor(Date.now() / 1000),
      gemini,
      scanLimiter,
      botApi: bot.api,
    },
    corsOrigin: env.MINI_APP_URL,
  });

  if (env.BOT_MODE === "webhook") {
    if (!env.WEBHOOK_URL) throw new Error("WEBHOOK_URL required in webhook mode");
    // Mount the route BEFORE listening, then register with Telegram AFTER, so
    // the container passes its health check even if setWebhook hiccups.
    mountWebhookRoute(app, bot);
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Bot in webhook mode, listening on :${env.PORT}`);
    const url = await registerWebhook(bot, env.WEBHOOK_URL, (m) =>
      app.log.warn(m),
    );
    if (url) app.log.info(`Webhook registered at ${url}`);
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
