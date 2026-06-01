import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@jemaw/shared/schema";

export interface DbConfig {
  /** Full connection URL (local dev, or proxy). */
  databaseUrl: string;
  /**
   * Cloud SQL instance connection name (project:region:instance). When set,
   * the client connects over the Cloud Run Unix socket at
   * /cloudsql/<name> instead of TCP. DATABASE_URL then only supplies
   * credentials + db name (host/port are ignored).
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

/**
 * Connect to Cloud SQL via the Unix socket Cloud Run mounts at
 * /cloudsql/<connection-name>. The socket-form URL (postgres://user:pass@/db)
 * has an empty host, which the WHATWG URL parser rejects, so we parse the
 * credentials with a regex instead and pass the socket dir as `host`
 * (postgres-js treats a leading-slash host as a Unix socket path).
 */
function socketClient(databaseUrl: string, connectionName: string) {
  // postgres://USER:PASSWORD@[host]/DBNAME[?...]
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
