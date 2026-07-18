/**
 * Conversation-flow engine for interactive Jemaw.
 *
 * Goal: meddlesome group-infrastructure character who is aware of banter,
 * backlog, and how often the group pokes it — not a broken record that
 * lists expenses every single turn.
 */
import type {
  ConversationFlowV1,
  ConversationPhase,
  MoneyMentionPolicy,
  PublicSafeFactPacket,
} from "@jemaw/shared/humor";

const MONEYISH =
  /\b(draft|drafts|pending|expense|expenses|ledger|lunch|dinner|amount|etb|birr|owe|owes|pay|paid|settle|settlement|waiting|review|mini\s*app|books?|queue|backlog|\d{2,})\b/i;

export function textMentionsMoney(text: string): boolean {
  return MONEYISH.test(text);
}

export function buildConversationFlow(input: {
  /** direct_chat | scan outcome path */
  kind: "chat" | "scan";
  pendingCount: number;
  /** Recent group messages that addressed jemaw (last ~1h), newest first optional. */
  pokeCount1h: number;
  /** Last bot reply texts (newest first). */
  recentBotTexts: string[];
  publicRepliesToday: number;
  maxPublicRepliesPerDay: number;
  /** User utterance (chat only). */
  userText?: string;
}): ConversationFlowV1 {
  const streak = moneyMentionStreak(input.recentBotTexts, 4);
  const nearCap =
    input.maxPublicRepliesPerDay > 0 &&
    input.publicRepliesToday >= Math.max(1, input.maxPublicRepliesPerDay - 3);

  if (input.kind === "scan") {
    return {
      phase: "scan_report",
      poke_count_1h: input.pokeCount1h,
      recent_money_mention_streak: streak,
      public_replies_today: input.publicRepliesToday,
      max_public_replies_per_day: input.maxPublicRepliesPerDay,
      near_daily_cap: nearCap,
      money_mention: "prefer",
      directive:
        "Report this scan outcome. Be specific if drafts/amounts are in CONTEXT. Keep it one beat, not a lecture.",
    };
  }

  // Chat path
  const userWantsMoney = userAsksAboutMoney(input.userText ?? "");
  const pending = input.pendingCount;

  let phase: ConversationPhase;
  let money: MoneyMentionPolicy;
  let directive: string;

  if (pending === 0) {
    phase = "open_banter";
    money = "avoid";
    directive =
      "Pure social. No money lecture. Ledger is clear. Be fun, short, group-facing.";
  } else if (userWantsMoney) {
    phase = "aware_idle";
    money = "prefer";
    directive =
      "They asked about money/drafts. Answer with approved drafts/amounts only. Still sound like a person, not a spreadsheet.";
  } else if (streak >= 2 && input.pokeCount1h < 5) {
    // Already monologued about drafts — break the pattern.
    phase = "open_banter";
    money = "avoid";
    directive =
      "You already talked money recently. Do NOT re-list expenses. Pure banter / vibe / self-aware meddler. Save the backlog for later.";
  } else if (input.pokeCount1h <= 1) {
    phase = "open_banter";
    money = "avoid";
    directive =
      "First poke in a while. Match their energy (greeting/joke). Do not dump the expense list. At most a one-word vibe that you're around.";
  } else if (input.pokeCount1h === 2) {
    phase = "aware_idle";
    money = "optional";
    directive =
      "Second poke. Light awareness OK — optional tiny hint there is unfinished group bookkeeping, no full inventory.";
  } else if (input.pokeCount1h <= 4) {
    phase = "bored_nudge";
    money = "prefer";
    directive =
      "You're getting bored. Group keeps poking but backlog sits. Playful meddler energy: call out that open drafts still need a decision. One concrete draft/amount max if useful. Group benefit, not personal attack.";
  } else {
    phase = "hard_nudge";
    money = "require_light";
    directive =
      "Hard playful ultimatum. You're the group infrastructure spirit tired of idle pokes: e.g. clear/pay/review the open draft (use one approved label+amount) or you'll go quiet. Never invent balances. Never shame poverty. Protect the GROUP process.";
  }

  if (nearCap) {
    directive +=
      " Also lightly note you're near your daily chatter budget for this group.";
  }

  return {
    phase,
    poke_count_1h: input.pokeCount1h,
    recent_money_mention_streak: streak,
    public_replies_today: input.publicRepliesToday,
    max_public_replies_per_day: input.maxPublicRepliesPerDay,
    near_daily_cap: nearCap,
    money_mention: money,
    directive,
  };
}

export function moneyMentionStreak(
  recentBotTexts: string[],
  window: number,
): number {
  let n = 0;
  for (const t of recentBotTexts.slice(0, window)) {
    if (textMentionsMoney(t)) n += 1;
    else break;
  }
  return n;
}

export function userAsksAboutMoney(text: string): boolean {
  return /\b(owe|owes|balance|pending|draft|expense|pay|paid|settle|how\s+much|what'?s\s+left|queue|backlog|lunch|dinner)\b/i.test(
    text,
  );
}

/** Scoring: reward following money_mention policy. */
export function scoreFlowFit(
  text: string,
  packet: PublicSafeFactPacket,
): number {
  const flow = packet.conversation_flow;
  if (!flow) return 0;
  const money = textMentionsMoney(text);
  let score = 0;
  switch (flow.money_mention) {
    case "avoid":
      score += money ? -5 : 4;
      break;
    case "optional":
      score += money ? 1 : 2;
      break;
    case "prefer":
      score += money ? 3 : 0;
      break;
    case "require_light":
      score += money ? 4 : -3;
      break;
  }
  // Hard nudge should feel a bit pushy
  if (flow.phase === "hard_nudge" && /\b(pay|review|decide|quiet|bored|come on|won't talk)\b/i.test(text)) {
    score += 2;
  }
  if (flow.phase === "open_banter" && /\b(hey|yo|hi|here|sup|alive|good|bored|watching)\b/i.test(text)) {
    score += 1;
  }
  return score;
}

export function phaseLabel(phase: ConversationPhase): string {
  return phase;
}
