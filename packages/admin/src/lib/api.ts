/**
 * Admin API client. Attaches the Firebase ID token as a bearer on every
 * request. The active base URL comes from VITE_API_BASE_URL.
 */
import { getIdToken } from "./auth.js";

/** A non-2xx response; `message` is the API's error text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8090";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // Fastify rejects an empty body declared as JSON, so only label real bodies.
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
