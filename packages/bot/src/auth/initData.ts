/**
 * Telegram Mini App initData verification (JEMAW_PLAN.md §15).
 *
 * Algorithm (per Telegram docs):
 *   secret_key      = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   data_check_str  = sorted "key=value" lines joined by "\n", excluding `hash`
 *   computed_hash   = hex( HMAC_SHA256(key=secret_key, message=data_check_str) )
 *   valid  <=>  computed_hash === provided hash  (constant-time)
 *
 * Also rejects initData whose auth_date is older than maxAgeSeconds (replay).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
}

export interface VerifyResult {
  ok: boolean;
  reason?: "no_hash" | "bad_signature" | "expired" | "no_user" | "malformed";
  data?: VerifiedInitData;
}

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyInitData(
  initData: string,
  botToken: string,
  nowSeconds: number,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): VerifyResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no_hash" };

  // Build the data-check-string: all fields except hash, sorted, key=value.
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { ok: false, reason: "malformed" };
  if (nowSeconds - authDate > maxAgeSeconds) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "no_user" };
  let user: TelegramUser;
  try {
    const u = JSON.parse(userRaw) as {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    user = {
      id: BigInt(u.id),
      firstName: u.first_name,
      lastName: u.last_name,
      username: u.username,
    };
  } catch {
    return { ok: false, reason: "no_user" };
  }

  return { ok: true, data: { user, authDate } };
}

/** Build a signed initData string. Used by tests (and never in production). */
export function signInitDataForTest(
  fields: Record<string, string>,
  botToken: string,
): string {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`);
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}
