/**
 * Minimal Telegram Bot API client for the console: announcements, renaming a
 * chat, leaving a deleted group's chat, and health checks. Uses the same bot
 * token as the bot. Never throws; every call resolves to ok or an error.
 */
export type TgResult<T> = { ok: true; result: T } | { ok: false; error: string; code?: number };

export interface TelegramClient {
  configured: boolean;
  call<T>(method: string, params?: Record<string, unknown>): Promise<TgResult<T>>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTelegramClient(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  if (!token) {
    return {
      configured: false,
      call: async () => ({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set on the API" }),
    };
  }
  async function call<T>(method: string, params: Record<string, unknown> = {}, attempt = 0): Promise<TgResult<T>> {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json()) as {
        ok: boolean;
        result?: T;
        description?: string;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      if (body.ok) return { ok: true, result: body.result as T };
      // Flood control: wait as told, once or twice, then give up.
      const retry = body.parameters?.retry_after;
      if (body.error_code === 429 && retry && attempt < 2) {
        await sleep(Math.min(retry, 30) * 1000);
        return call<T>(method, params, attempt + 1);
      }
      return { ok: false, error: body.description ?? `HTTP ${res.status}`, code: body.error_code };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { configured: true, call };
}
