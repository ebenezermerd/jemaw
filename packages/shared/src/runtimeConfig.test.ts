import { describe, it, expect } from "vitest";
import { DEFAULT_BOT_RUNTIME_CONFIG, runtimeConfigFromRows } from "./runtimeConfig.js";

describe("runtimeConfigFromRows", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(runtimeConfigFromRows([])).toEqual(DEFAULT_BOT_RUNTIME_CONFIG);
  });

  it("reads stored values and ignores off-type ones", () => {
    const c = runtimeConfigFromRows([
      { key: "bot.ai.scanEnabled", value: false },
      { key: "bot.ai.chatEnabled", value: "nope" },
      { key: "bot.ai.model", value: "  openai/gpt-oss-20b " },
      { key: "bot.ai.scanCooldownSeconds", value: 2 },
      { key: "bot.maintenanceMessage", value: "" },
      { key: "admins", value: { emails: [] } },
    ]);
    expect(c.scanEnabled).toBe(false);
    expect(c.chatEnabled).toBe(true);
    expect(c.model).toBe("openai/gpt-oss-20b");
    expect(c.scanCooldownSeconds).toBe(5);
    expect(c.maintenanceMessage).toBeNull();
  });
});
