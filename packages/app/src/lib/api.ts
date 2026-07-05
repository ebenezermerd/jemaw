/**
 * API client. Attaches Telegram initData on every request (verified server-side
 * via HMAC). The active group id comes from the Mini App start param, or a
 * ?group= query override for local development.
 */
import { getInitData } from "../telegram.js";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/**
 * Thrown on any non-2xx response. Carries the HTTP status and the parsed JSON
 * body so callers can read structured fields (`error`, `maxAllocatable`, …)
 * instead of scraping a string message.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; maxAllocatable?: string; [k: string]: unknown },
  ) {
    super(body.error ?? `${status}: request failed`);
    this.name = "ApiError";
  }
}

export function getGroupId(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("group");
  if (fromQuery) return fromQuery;
  const wa = window.Telegram?.WebApp as { initDataUnsafe?: { start_param?: string } } | undefined;
  return wa?.initDataUnsafe?.start_param ?? null;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Only claim a JSON content type when a body is actually sent — Fastify
  // rejects an empty body with an application/json content type as a 400.
  const headers: Record<string, string> = {
    "x-telegram-init-data": getInitData(),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let body: { error?: string; maxAllocatable?: string; [k: string]: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
