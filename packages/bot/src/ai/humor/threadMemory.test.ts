import { describe, it, expect } from "vitest";
import { buildThreadTurns } from "./threadMemory.js";

describe("buildThreadTurns", () => {
  it("interleaves user jemaw pokes and bot replies by time", () => {
    const t0 = Date.now() - 10 * 60_000;
    const turns = buildThreadTurns({
      messages: [
        { text: "hey jemaw what's up?", sentAt: new Date(t0) },
        { text: "unrelated chat", sentAt: new Date(t0 + 1000) },
        { text: "you cooking jemaw?", sentAt: new Date(t0 + 30_000) },
      ],
      botReplies: [
        { text: "Yo. Around.", createdAt: new Date(t0 + 5_000) },
      ],
      maxTurns: 8,
    });
    expect(turns.map((x) => x.role)).toEqual(["user", "jemaw", "user"]);
    expect(turns[0]!.text).toMatch(/what's up/i);
    expect(turns[1]!.text).toMatch(/Around/);
  });

  it("drops old turns outside max age", () => {
    const old = Date.now() - 5 * 60 * 60_000;
    const turns = buildThreadTurns({
      messages: [{ text: "hey jemaw", sentAt: new Date(old) }],
      botReplies: [],
      maxAgeMs: 2 * 60 * 60_000,
    });
    expect(turns).toEqual([]);
  });
});
