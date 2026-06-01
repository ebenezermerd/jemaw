import { describe, it, expect } from "vitest";
import { createDb } from "./db.js";

describe("createDb socket mode", () => {
  it("parses a socket-style DATABASE_URL without throwing Invalid URL", () => {
    // postgres://user:pass@/db has an empty host (rejected by new URL()).
    expect(() =>
      createDb({
        databaseUrl: "postgres://jemaw:s3cr3t@/jemaw",
        instanceConnectionName: "proj:region:inst",
      }),
    ).not.toThrow();
  });

  it("rejects a malformed connection string in socket mode", () => {
    expect(() =>
      createDb({
        databaseUrl: "not-a-postgres-url",
        instanceConnectionName: "proj:region:inst",
      }),
    ).toThrow(/valid postgres/);
  });

  it("accepts a normal TCP url in non-socket mode", () => {
    expect(() =>
      createDb("postgres://jemaw:jemaw@localhost:5432/jemaw"),
    ).not.toThrow();
  });
});
