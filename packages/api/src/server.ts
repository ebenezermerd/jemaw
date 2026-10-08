import Fastify, { type FastifyInstance } from "fastify";
import type { AdminHealthResponse } from "@jemaw/shared/types";
import { registerApi, type ApiDeps } from "./routes.js";

export interface ServerDeps {
  api: ApiDeps;
  /** Allowed CORS origin for the admin SPA. */
  corsOrigin: string | undefined;
}

/** Build the Fastify app: /health, CORS for the admin SPA, and the admin API. */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
  });

  const origin = deps.corsOrigin;
  app.addHook("onRequest", async (req, reply) => {
    if (origin) reply.header("access-control-allow-origin", origin);
    reply.header(
      "access-control-allow-headers",
      "content-type,authorization",
    );
    reply.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      await reply.code(204).send();
    }
  });

  app.get("/health", async (): Promise<AdminHealthResponse> => {
    return { ok: true, service: "jemaw-api" };
  });

  await registerApi(app, deps.api);

  return app;
}
