import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://jemaw:jemaw@localhost:5432/jemaw",
  TELEGRAM_BOT_TOKEN: "123:abc",
};

describe("loadEnv", () => {
  it("accepts a valid minimal env and defaults BOT_MODE to polling", () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.BOT_MODE).toBe("polling");
    expect(env.PORT).toBe(8080);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      loadEnv({ TELEGRAM_BOT_TOKEN: "123:abc" } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a missing TELEGRAM_BOT_TOKEN", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: base.DATABASE_URL } as NodeJS.ProcessEnv),
    ).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("requires WEBHOOK_URL when BOT_MODE=webhook", () => {
    expect(() =>
      loadEnv({ ...base, BOT_MODE: "webhook" } as NodeJS.ProcessEnv),
    ).toThrow(/WEBHOOK_URL/);
  });
});
