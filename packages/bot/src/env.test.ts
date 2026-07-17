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

  it("allows webhook mode without WEBHOOK_URL when registration is disabled", () => {
    const env = loadEnv({
      ...base,
      BOT_MODE: "webhook",
      REGISTER_TELEGRAM_WEBHOOK: "false",
    } as NodeJS.ProcessEnv);

    expect(env.REGISTER_TELEGRAM_WEBHOOK).toBe(false);
  });

  it("accepts optional scan model overrides", () => {
    const env = loadEnv({
      ...base,
      GROQ_MODEL: "llama-3.3-70b-versatile",
      GEMINI_MODEL: "gemini-2.5-flash",
    } as NodeJS.ProcessEnv);
    expect(env.GROQ_MODEL).toBe("llama-3.3-70b-versatile");
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
  });
});
