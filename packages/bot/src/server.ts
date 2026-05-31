import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@jemaw/shared/types";
import { registerApi, type ApiDeps } from "./api/routes.js";

export interface ServerDeps {
  api: ApiDeps;
  /** allowed CORS origin for the Mini App (Vite dev or Vercel). */
  corsOrigin: string | undefined;
}

/**
 * Build the Fastify app: /health, CORS for the Mini App, and the Phase 1 API.
 * The Telegram webhook route is mounted separately by index.ts when needed.
 */
export async function buildServer(
  deps: ServerDeps,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Minimal CORS — the Mini App is served from a different origin.
  const origin = deps.corsOrigin;
  app.addHook("onRequest", async (req, reply) => {
    if (origin) reply.header("access-control-allow-origin", origin);
    reply.header(
      "access-control-allow-headers",
      "content-type,x-telegram-init-data,authorization",
    );
    reply.header(
      "access-control-allow-methods",
      "GET,POST,PATCH,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      await reply.code(204).send();
    }
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    return { ok: true, service: "jemaw-bot" };
  });

  await registerApi(app, deps.api);

  return app;
}
