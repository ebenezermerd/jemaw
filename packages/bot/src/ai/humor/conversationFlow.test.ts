import { describe, it, expect } from "vitest";
import {
  buildConversationFlow,
  moneyMentionStreak,
  scoreFlowFit,
  textMentionsMoney,
} from "./conversationFlow.js";
import { buildDirectChatPacket } from "./factPacket.js";

describe("buildConversationFlow", () => {
  it("keeps first social poke as open banter without money", () => {
    const f = buildConversationFlow({
      kind: "chat",
      pendingCount: 3,
      pokeCount1h: 1,
      recentBotTexts: [],
      publicRepliesToday: 2,
      maxPublicRepliesPerDay: 50,
      userText: "hey jemaw what's up?",
    });
    expect(f.phase).toBe("open_banter");
    expect(f.money_mention).toBe("avoid");
  });

  it("escalates to bored then hard nudge after repeated pokes", () => {
    const bored = buildConversationFlow({
      kind: "chat",
      pendingCount: 3,
      pokeCount1h: 3,
      recentBotTexts: ["Yo."],
      publicRepliesToday: 3,
      maxPublicRepliesPerDay: 50,
      userText: "jemaw you good?",
    });
    expect(bored.phase).toBe("bored_nudge");
    expect(bored.money_mention).toBe("prefer");

    const hard = buildConversationFlow({
      kind: "chat",
      pendingCount: 3,
      pokeCount1h: 6,
      recentBotTexts: ["Yo."],
      publicRepliesToday: 6,
      maxPublicRepliesPerDay: 50,
      userText: "hey jemaw",
    });
    expect(hard.phase).toBe("hard_nudge");
    expect(hard.money_mention).toBe("require_light");
  });

  it("breaks money monologue when streak is high", () => {
    const f = buildConversationFlow({
      kind: "chat",
      pendingCount: 3,
      pokeCount1h: 2,
      recentBotTexts: [
        "Still 3 drafts Lunch 600 waiting",
        "Dinner 2500 still pending review",
      ],
      publicRepliesToday: 4,
      maxPublicRepliesPerDay: 50,
      userText: "yo jemaw",
    });
    expect(f.phase).toBe("open_banter");
    expect(f.money_mention).toBe("avoid");
  });

  it("prefers money when user asks about pending", () => {
    const f = buildConversationFlow({
      kind: "chat",
      pendingCount: 2,
      pokeCount1h: 1,
      recentBotTexts: [],
      publicRepliesToday: 0,
      maxPublicRepliesPerDay: 50,
      userText: "jemaw what's pending?",
    });
    expect(f.money_mention).toBe("prefer");
  });

  it("marks scan path as scan_report", () => {
    const f = buildConversationFlow({
      kind: "scan",
      pendingCount: 3,
      pokeCount1h: 1,
      recentBotTexts: [],
      publicRepliesToday: 1,
      maxPublicRepliesPerDay: 50,
    });
    expect(f.phase).toBe("scan_report");
  });
});

describe("moneyMentionStreak", () => {
  it("counts consecutive money replies", () => {
    expect(
      moneyMentionStreak(
        ["3 drafts waiting", "Lunch 600 still open", "hey"],
        4,
      ),
    ).toBe(2);
  });
});

describe("scoreFlowFit", () => {
  it("rewards banter when money is avoided", () => {
    const flow = buildConversationFlow({
      kind: "chat",
      pendingCount: 3,
      pokeCount1h: 1,
      recentBotTexts: [],
      publicRepliesToday: 0,
      maxPublicRepliesPerDay: 50,
      userText: "hey jemaw",
    });
    const packet = buildDirectChatPacket({
      pendingCount: 3,
      drafts: [{ label: "Lunch", amount: "600" }],
      addressedUtterance: "hey jemaw",
      conversationFlow: flow,
    });
    expect(scoreFlowFit("Yo. I'm around. Meddling lightly.", packet)).toBeGreaterThan(
      scoreFlowFit("Lunch 600 Dinner 2500 still waiting.", packet),
    );
  });
});

describe("textMentionsMoney", () => {
  it("detects draft talk", () => {
    expect(textMentionsMoney("3 drafts still waiting")).toBe(true);
    expect(textMentionsMoney("Yo I'm here")).toBe(false);
  });
});
