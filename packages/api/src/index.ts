import { loadEnv, parseAdminEmails } from "./env.js";
import { createDb } from "./db.js";
import { createFirebaseVerifier } from "./auth/firebase.js";
import { seedAdminsIfEmpty } from "./repo.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb({
    databaseUrl: env.DATABASE_URL,
    instanceConnectionName: env.INSTANCE_CONNECTION_NAME,
  });

  await seedAdminsIfEmpty(db, parseAdminEmails(env.ADMIN_EMAILS));

  const verifier = createFirebaseVerifier(env.FIREBASE_PROJECT_ID);
  const app = await buildServer({
    api: { db, verifier, now: () => Date.now() },
    corsOrigin: env.ADMIN_ORIGIN,
  });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  console.log(`[api] listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
