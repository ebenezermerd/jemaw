import { describe, it, expect } from "vitest";
import { DEFAULT_BOSS_CONFIG, isBoss, parseBossConfig } from "./boss.js";

describe("parseBossConfig", () => {
  it("defaults to respect with every privilege on and nobody linked", () => {
    expect(parseBossConfig(undefined)).toEqual(DEFAULT_BOSS_CONFIG);
  });

  it("keeps valid people once and drops junk", () => {
    const c = parseBossConfig({
      people: [
        { telegramUserId: "123", name: "Ebenezer" },
        { telegramUserId: "123", name: "dup" },
        { telegramUserId: "abc", name: "bad" },
        null,
      ],
      tone: "gentle",
      skipPause: false,
      commands: "yes",
    });
    expect(c.people).toEqual([{ telegramUserId: "123", name: "Ebenezer" }]);
    expect(c.tone).toBe("gentle");
    expect(c.skipPause).toBe(false);
    expect(c.commands).toBe(true);
  });

  it("recognises a boss by Telegram id in any form", () => {
    const c = parseBossConfig({ people: [{ telegramUserId: "123", name: "E" }] });
    expect(isBoss(c, 123n)).toBe(true);
    expect(isBoss(c, 123)).toBe(true);
    expect(isBoss(c, "124")).toBe(false);
    expect(isBoss(c, null)).toBe(false);
  });
});
