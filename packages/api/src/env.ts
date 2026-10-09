import { z } from "zod";

/**
 * Environment contract for the admin API. Validated at startup; the process
 * refuses to boot on missing/invalid vars.
 *
 * FIREBASE_PROJECT_ID is required to verify ID tokens. On Cloud Run the
 * Application Default Credentials are picked up automatically, so no key file
 * is needed. ADMIN_EMAILS seeds the allowlist on first boot.
 */
const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .startsWith("postgres", "DATABASE_URL must be a postgres connection string"),
  PORT: z.coerce.number().int().positive().default(8090),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  /** Comma-separated emails seeded as admins on first boot. */
  ADMIN_EMAILS: z.string().optional(),
  /** Allowed CORS origin (the admin SPA). */
  ADMIN_ORIGIN: z.string().url().optional(),
  /** Set in Cloud Run to connect to Cloud SQL over the mounted Unix socket. */
  INSTANCE_CONNECTION_NAME: z.string().optional(),
  /** The bot's token: sends announcements, renames or leaves chats, checks health. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** Lets the console ask Groq for the current limits ("Check now"). */
  GROQ_API_KEY: z.string().optional(),
  /** The bot's default Groq model, when the console hasn't overridden it. */
  GROQ_MODEL: z.string().optional(),
  /** Mini App short name, for "Open Jemaw" buttons on test posts (t.me/<bot>/<name>). */
  MINI_APP_SHORT_NAME: z.string().default("app"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

/** Parse ADMIN_EMAILS into a normalized lowercase list. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}
