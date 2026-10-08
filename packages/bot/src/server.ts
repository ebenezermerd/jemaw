import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@jemaw/shared/types";
import { registerApi, type ApiDeps } from "./api/routes.js";

export interface ServerDeps {
  api: ApiDeps;
  /**
   * Allowed CORS origin(s) for the Mini App. A list supports serving the app
   * from more than one host at once (e.g. legacy Firebase + CloudFront during
   * a migration); the first entry is the primary origin.
   */
  corsOrigin: string | readonly string[] | undefined;
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

  // Tolerate an empty body with an application/json content type (older app
  // shells send the header on bodyless DELETEs; the default parser 400s).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (typeof body !== "string" || body.trim() === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  // Minimal CORS — the Mini App is served from a different origin.
  const origins = (
    typeof deps.corsOrigin === "string" ? [deps.corsOrigin] : (deps.corsOrigin ?? [])
  ).filter((o) => o.length > 0);
  app.addHook("onRequest", async (req, reply) => {
    if (origins.length > 0) {
      const requestOrigin = req.headers.origin;
      const matched =
        requestOrigin && origins.includes(requestOrigin)
          ? requestOrigin
          : origins[0];
      reply.header("access-control-allow-origin", matched);
      reply.header("vary", "origin");
    }
    reply.header(
      "access-control-allow-headers",
      "content-type,x-telegram-init-data,authorization",
    );
    reply.header(
      "access-control-allow-methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
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
