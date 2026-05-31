import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@jemaw/shared/schema";

/** Build a Drizzle client bound to the full Jemaw schema. */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
