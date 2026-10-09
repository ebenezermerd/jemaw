/**
 * Minimal Telegram Bot API client for the console: announcements, renaming a
 * chat, leaving a deleted group's chat, and health checks. Uses the same bot
 * token as the bot. Never throws; every call resolves to ok or an error.
 */
export type TgResult<T> = { ok: true; result: T } | { ok: false; error: string; code?: number };

export interface TelegramClient {
  configured: boolean;
  call<T>(method: string, params?: Record<string, unknown>): Promise<TgResult<T>>;
  /** Multipart call: each file is referenced from params as "attach://<name>". */
  upload<T>(method: string, params: Record<string, unknown>, files: Record<string, Buffer>): Promise<TgResult<T>>;
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
      upload: async () => ({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set on the API" }),
    };
  }
  async function call<T>(
    method: string,
    params: Record<string, unknown> = {},
    attempt = 0,
    files?: Record<string, Buffer>,
  ): Promise<TgResult<T>> {
    try {
      let payload: string | FormData = JSON.stringify(params);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (files && Object.keys(files).length) {
        const form = new FormData();
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined) form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
        for (const [name, buf] of Object.entries(files)) {
          form.append(name, new Blob([new Uint8Array(buf)], { type: "image/png" }), `${name}.png`);
        }
        payload = form;
        delete headers["content-type"];
      }
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(files ? 30_000 : 10_000),
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
        return call<T>(method, params, attempt + 1, files);
      }
      return { ok: false, error: body.description ?? `HTTP ${res.status}`, code: body.error_code };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return {
    configured: true,
    call: (method, params) => call(method, params),
    upload: (method, params, files) => call(method, params, 0, files),
  };
}
