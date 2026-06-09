import { z } from "zod";

/**
 * Environment contract for the bot. Validated at startup — the process
 * refuses to boot on missing/invalid vars. Future-phase vars (Gemini, Redis,
 * Sentry) are intentionally optional here.
 */
const schema = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .startsWith("postgres", "DATABASE_URL must be a postgres connection string"),
    TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
    BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
    WEBHOOK_URL: z.string().url().optional(),
    PORT: z.coerce.number().int().positive().default(8080),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    MINI_APP_URL: z.string().url().optional(),
    // Bot username + Mini App short name (BotFather /newapp) used to build the
    // t.me deep link that opens the Mini App IN Telegram from a group with the
    // group id as start_param. Without these the group button falls back to a
    // plain url (opens in a browser, no context).
    BOT_USERNAME: z.string().optional(),
    MINI_APP_SHORT_NAME: z.string().optional(),
    // Set in Cloud Run to connect to Cloud SQL over the mounted Unix socket.
    INSTANCE_CONNECTION_NAME: z.string().optional(),
    // AI scanning. Groq is preferred when set (faster, generous free tier);
    // Gemini is the fallback. Either alone works; with both, Groq is primary and
    // Gemini covers its failures. Without either, scans don't run.
    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().optional(),
  })
  .refine((e) => e.BOT_MODE !== "webhook" || !!e.WEBHOOK_URL, {
    message: "WEBHOOK_URL is required when BOT_MODE=webhook",
    path: ["WEBHOOK_URL"],
  });

export type Env = z.infer<typeof schema>;

/** Parse and validate env. Throws a readable error on failure. */
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
