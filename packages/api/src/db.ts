import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@jemaw/shared/schema";

export interface DbConfig {
  databaseUrl: string;
  /**
   * Cloud SQL instance connection name (project:region:instance). When set,
   * connect over the Cloud Run Unix socket at /cloudsql/<name> instead of TCP.
   */
  instanceConnectionName?: string;
}

/** Build a Drizzle client bound to the full Jemaw schema. */
export function createDb(config: string | DbConfig) {
  const cfg: DbConfig =
    typeof config === "string" ? { databaseUrl: config } : config;

  const client = cfg.instanceConnectionName
    ? socketClient(cfg.databaseUrl, cfg.instanceConnectionName)
    : postgres(cfg.databaseUrl, { max: 5 });

  return drizzle(client, { schema });
}

/** Connect to Cloud SQL via the Unix socket Cloud Run mounts at /cloudsql/<name>. */
function socketClient(databaseUrl: string, connectionName: string) {
  const m = /^postgres(?:ql)?:\/\/([^:]+):([^@]*)@[^/]*\/([^?]+)/.exec(
    databaseUrl,
  );
  if (!m) {
    throw new Error("DATABASE_URL is not a valid postgres connection string");
  }
  return postgres({
    host: `/cloudsql/${connectionName}`,
    username: decodeURIComponent(m[1]!),
    password: decodeURIComponent(m[2]!),
    database: decodeURIComponent(m[3]!),
    max: 5,
  });
}

export type Db = ReturnType<typeof createDb>;
