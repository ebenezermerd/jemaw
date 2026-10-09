/**
 * Telegram profile photos for the mini app and the console (Node only).
 * Members' photos come from the Bot API, which needs the bot token, so the
 * servers proxy them at /avatars/<telegramId>.jpg?s=<signature>. The signature
 * is an HMAC of the id with the bot token: only links the API handed out work,
 * and the token never reaches a browser. Photos are cached in memory.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function avatarSignature(botToken: string, telegramUserId: string): string {
  return createHmac("sha256", botToken).update(`jemaw-avatar:${telegramUserId}`).digest("base64url").slice(0, 22);
}

/** Path for a member's photo, or null for members without a Telegram account. */
export function avatarPath(botToken: string | undefined, telegramUserId: string | bigint): string | null {
  const id = String(telegramUserId);
  if (!botToken || !/^\d+$/.test(id)) return null;
  return `/avatars/${id}.jpg?s=${avatarSignature(botToken, id)}`;
}

export function verifyAvatarSignature(botToken: string, telegramUserId: string, sig: string | undefined): boolean {
  if (!sig || !/^\d+$/.test(telegramUserId)) return false;
  const want = Buffer.from(avatarSignature(botToken, telegramUserId));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface AvatarImage {
  body: Uint8Array;
  contentType: string;
}

interface Cached {
  image: AvatarImage | null;
  at: number;
}

/**
 * Fetch a user's current profile photo (about 160px) through the Bot API.
 * Resolves null when they have none or hide it. Hits and misses are cached.
 */
export function createAvatarFetcher(
  botToken: string,
  opts: { ttlMs?: number; maxEntries?: number; fetchImpl?: typeof fetch } = {},
) {
  const ttl = opts.ttlMs ?? 6 * 60 * 60_000;
  const max = opts.maxEntries ?? 500;
  const f = opts.fetchImpl ?? fetch;
  const cache = new Map<string, Cached>();
  const inflight = new Map<string, Promise<AvatarImage | null>>();
  const api = async <T>(method: string, params: Record<string, unknown>): Promise<T | null> => {
    const res = await f(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { ok: boolean; result?: T };
    return json.ok ? (json.result ?? null) : null;
  };
  async function load(id: string): Promise<AvatarImage | null> {
    const photos = await api<{ photos: { file_id: string; width: number }[][] }>("getUserProfilePhotos", {
      user_id: Number(id),
      limit: 1,
    });
    const sizes = photos?.photos[0];
    if (!sizes?.length) return null;
    const pick = sizes.find((s) => s.width >= 160) ?? sizes[sizes.length - 1]!;
    const file = await api<{ file_path?: string }>("getFile", { file_id: pick.file_id });
    if (!file?.file_path) return null;
    const img = await f(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`, { signal: AbortSignal.timeout(8000) });
    if (!img.ok) return null;
    return { body: new Uint8Array(await img.arrayBuffer()), contentType: img.headers.get("content-type") ?? "image/jpeg" };
  }
  return async function getAvatar(telegramUserId: string): Promise<AvatarImage | null> {
    const hit = cache.get(telegramUserId);
    if (hit && Date.now() - hit.at < ttl) return hit.image;
    let p = inflight.get(telegramUserId);
    if (!p) {
      p = load(telegramUserId)
        .catch(() => null)
        .finally(() => inflight.delete(telegramUserId));
      inflight.set(telegramUserId, p);
    }
    const image = await p;
    if (cache.size >= max) cache.delete(cache.keys().next().value!);
    cache.set(telegramUserId, { image, at: Date.now() });
    return image;
  };
}
