/**
 * Fastify preHandler that authenticates a Mini App request:
 *   1. Read initData from the `x-telegram-init-data` header (or Authorization).
 *   2. Verify HMAC + freshness against the bot token.
 *   3. Resolve the Telegram user to a member of the route's :groupId.
 *   4. Attach { group, member } to the request; 401/403 otherwise.
 */
import { parseGroupAccess } from "@jemaw/shared/groupAccess";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db.js";
import type { Group, Member } from "@jemaw/shared/schema";
import { verifyInitData } from "./initData.js";
import { getGroupById, findMemberByTelegramId } from "../repo.js";

declare module "fastify" {
  interface FastifyRequest {
    jemaw?: { group: Group; member: Member };
  }
}

export interface AuthDeps {
  db: Db;
  botToken: string;
  now: () => number; // seconds
}

function readInitData(req: FastifyRequest): string | null {
  const header = req.headers["x-telegram-init-data"];
  if (typeof header === "string" && header.length > 0) return header;
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("tma ")) {
    return auth.slice(4);
  }
  return null;
}

export function makeAuthHook(deps: AuthDeps) {
  return async function authHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const groupId = (req.params as { groupId?: string }).groupId;
    if (!groupId) {
      await reply.code(400).send({ error: "missing groupId" });
      return;
    }

    const initData = readInitData(req);
    if (!initData) {
      await reply.code(401).send({ error: "missing initData" });
      return;
    }

    const verified = verifyInitData(initData, deps.botToken, deps.now());
    if (!verified.ok || !verified.data) {
      await reply.code(401).send({ error: `auth: ${verified.reason}` });
      return;
    }

    const group = await getGroupById(deps.db, groupId);
    if (!group) {
      await reply.code(404).send({ error: "group not found" });
      return;
    }

    const member = await findMemberByTelegramId(
      deps.db,
      groupId,
      verified.data.user.id,
    );
    if (!member || !member.isActive) {
      await reply.code(403).send({ error: "not a member of this group" });
      return;
    }

    // A suspended group only exposes itself (so the app can show why);
    // everything else is closed until the Jemaw team lifts it.
    const access = parseGroupAccess((group.settings as Record<string, unknown> | null)?.access);
    const isGroupRead = req.method === "GET" && /^\/api\/groups\/[^/]+\/?$/.test(req.url.split("?")[0] ?? "");
    if (access.status === "suspended" && !isGroupRead) {
      await reply.code(423).send({ error: "this group is suspended", access });
      return;
    }

    req.jemaw = { group, member };
  };
}
