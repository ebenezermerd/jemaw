// Load the repo-root .env for local dev (Node >=20.6). Ignored in prod where
// Cloud Run injects real env vars and no .env file is present.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // no .env file — rely on the ambient environment
}

import { loadEnv, parseAdminEmails } from "./env.js";
import { createDb } from "./db.js";
import { createFirebaseVerifier } from "./auth/firebase.js";
import { seedAdminsIfEmpty } from "./repo.js";
import { buildServer } from "./server.js";
import { createTelegramClient } from "./telegram.js";
import { sweepQueued } from "./announce.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb({
    databaseUrl: env.DATABASE_URL,
    instanceConnectionName: env.INSTANCE_CONNECTION_NAME,
  });

  await seedAdminsIfEmpty(db, parseAdminEmails(env.ADMIN_EMAILS));

  const verifier = createFirebaseVerifier(env.FIREBASE_PROJECT_ID);
  const telegram = createTelegramClient(env.TELEGRAM_BOT_TOKEN);
  if (!telegram.configured) console.warn("[api] TELEGRAM_BOT_TOKEN not set: announcements and chat actions are off");
  const app = await buildServer({
    api: {
      db,
      verifier,
      now: () => Date.now(),
      telegram,
      botToken: env.TELEGRAM_BOT_TOKEN,
      groq: { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL },
    },
    corsOrigin: env.ADMIN_ORIGIN,
  });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  console.log(`[api] listening on :${env.PORT}`);
  void sweepQueued(db, telegram);
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
