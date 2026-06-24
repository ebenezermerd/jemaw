import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db.js";
import type { TokenVerifier } from "./firebase.js";
import { getAdmins } from "../repo.js";

/** The admin identity attached to an authenticated request. */
export interface AdminContext {
  uid: string;
  email: string | null;
  role: "super" | "admin";
}

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminContext;
  }
}

export interface AuthDeps {
  db: Db;
  verifier: TokenVerifier;
}

/**
 * Build a preHandler hook: verifies the Firebase ID token in the Authorization
 * header, then confirms the email is on the admin allowlist (app_config.admins).
 * On success attaches req.admin; otherwise sends 401/403 and returns.
 */
export function makeAuthHook(deps: AuthDeps) {
  return async function authHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = req.headers["authorization"];
    const token =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length).trim()
        : null;
    if (!token) {
      await reply.code(401).send({ error: "missing bearer token" });
      return;
    }
    const verified = await deps.verifier.verify(token);
    if (!verified) {
      await reply.code(401).send({ error: "invalid token" });
      return;
    }
    const email = verified.email?.toLowerCase() ?? null;
    const admins = await getAdmins(deps.db);
    if (!email || !admins.emails.includes(email)) {
      await reply.code(403).send({ error: "not an authorized admin" });
      return;
    }
    req.admin = {
      uid: verified.uid,
      email,
      role: admins.supers?.includes(email) ? "super" : "admin",
    };
  };
}
