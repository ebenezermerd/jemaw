/**
 * API client. Attaches Telegram initData on every request (verified server-side
 * via HMAC). The active group id comes from the Mini App start param, or a
 * ?group= query override for local development.
 */
import { getInitData } from "../telegram.js";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": getInitData(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
