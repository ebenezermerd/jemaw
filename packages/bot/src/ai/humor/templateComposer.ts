/**
 * Template composer — outcome-aware Phase 1–3 fallback.
 */
import type {
  HumorMode,
  PublicSafeFactPacket,
  HumorTriggerEvent,
} from "@jemaw/shared/humor";

export interface TemplateReply {
  text: string;
  templateId: string;
  style: "dry_observation" | "neutral" | "roast" | "chaos";
  source: "template";
}

type Template = {
  id: string;
  event: HumorTriggerEvent;
  modes: HumorMode[];
  body: string;
  style: TemplateReply["style"];
};

const TEMPLATES: Template[] = [
  // fresh finds
  {
    id: "fresh_1",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "{{new_written}} new draft{{new_written_s}} ready. Open Jemaw to review.",
    style: "dry_observation",
  },
  {
    id: "fresh_2",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Caught {{new_written}} new item{{new_written_s}}. {{pending_count}} total waiting.",
    style: "dry_observation",
  },
  {
    id: "fresh_3",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "{{new_written}} new expense draft{{new_written_s}} spotted. The ledger is listening.",
    style: "dry_observation",
  },
  {
    id: "fresh_roast",
    event: "scan_hit",
    modes: ["roast", "chaos"],
    body: "{{new_written}} new draft{{new_written_s}}. Someone has been busy with money.",
    style: "roast",
  },
  // still pending (deduped scan)
  {
    id: "pending_1",
    event: "scan_still_pending",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Still {{pending_count}} draft{{pending_s}} waiting. Nothing new this pass.",
    style: "dry_observation",
  },
  {
    id: "pending_2",
    event: "scan_still_pending",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Same {{pending_count}} open draft{{pending_s}}. Open Jemaw when you are ready.",
    style: "dry_observation",
  },
  {
    id: "pending_3",
    event: "scan_still_pending",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "No new finds. {{pending_count}} earlier draft{{pending_s}} still need a decision.",
    style: "dry_observation",
  },
  {
    id: "pending_roast",
    event: "scan_still_pending",
    modes: ["roast", "chaos"],
    body: "{{pending_count}} draft{{pending_s}} still hanging. The Mini App is patient. Are you?",
    style: "roast",
  },
  {
    id: "pending_topics",
    event: "scan_still_pending",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Still sitting on {{topic_line}}. {{pending_count}} open draft{{pending_s}}.",
    style: "dry_observation",
  },
  {
    id: "pending_topics_roast",
    event: "scan_still_pending",
    modes: ["roast", "chaos"],
    body: "{{topic_line}} still waiting for a grown-up decision. {{pending_count}} draft{{pending_s}}.",
    style: "roast",
  },
  {
    id: "fresh_topics",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "New draft{{new_written_s}}: {{topic_line}}. {{pending_count}} total waiting.",
    style: "dry_observation",
  },
  // miss
  {
    id: "miss_1",
    event: "scan_miss",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Nothing clear enough to record. A rare victory for ambiguity.",
    style: "dry_observation",
  },
  {
    id: "miss_2",
    event: "scan_miss",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "No clean expenses in the window. The books stay quiet.",
    style: "dry_observation",
  },
  {
    id: "miss_roast",
    event: "scan_miss",
    modes: ["roast", "chaos"],
    body: "Scan complete. Either you are thrifty or very subtle.",
    style: "roast",
  },
  // settlement
  {
    id: "settle_1",
    event: "settlement_completed",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Settled. The ledger has stopped holding a grudge.",
    style: "dry_observation",
  },
  {
    id: "settle_2",
    event: "settlement_completed",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Payment recorded. Diplomatic relations restored.",
    style: "dry_observation",
  },
  // direct social — pure banter (no money dump)
  {
    id: "chat_banter_1",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Hey. Still lurking in the group infrastructure. What's good?",
    style: "dry_observation",
  },
  {
    id: "chat_banter_2",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Yo. I'm around. Meddling at low power.",
    style: "dry_observation",
  },
  {
    id: "chat_banter_3",
    event: "direct_mention",
    modes: ["roast", "chaos"],
    body: "Present. Don't poke me unless you want opinions.",
    style: "roast",
  },
  // light / bored money
  {
    id: "chat_1",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Hey. Queue still has {{pending_count}} open draft{{pending_s}} when the group is ready.",
    style: "dry_observation",
  },
  {
    id: "chat_2",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Present. {{pending_count}} draft{{pending_s}} still waiting on a group decision.",
    style: "dry_observation",
  },
  {
    id: "chat_topics",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Getting bored. Still babysitting {{topic_line}} for the group.",
    style: "dry_observation",
  },
  {
    id: "chat_roast",
    event: "direct_mention",
    modes: ["roast", "chaos"],
    body: "Man, come on — clear {{topic_line}} or stop poking the infrastructure.",
    style: "roast",
  },
  {
    id: "chat_hard",
    event: "direct_mention",
    modes: ["roast", "chaos"],
    body: "Review {{topic_line}} for the group or I go quiet. I'm not a toy, I'm the books.",
    style: "roast",
  },
  {
    id: "chat_quiet",
    event: "direct_mention",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Hey. Books are clear — nothing pending. Free to mess around.",
    style: "dry_observation",
  },
];

export function composeFromTemplates(
  mode: HumorMode,
  packet: PublicSafeFactPacket,
  rng: () => number = Math.random,
): TemplateReply | null {
  if (mode === "off") return null;
  const hasTopics = Boolean(formatTopicLine(packet));
  const pending = packet.public_facts.pending_count ?? 0;
  const money = packet.conversation_flow?.money_mention ?? "optional";
  const phase = packet.conversation_flow?.phase;
  const pool = TEMPLATES.filter((t) => {
    if (t.event !== packet.event || !t.modes.includes(mode)) return false;
    if (t.body.includes("{{topic_line}}") && !hasTopics) return false;
    if (packet.event === "direct_mention") {
      if (t.id === "chat_quiet") return pending === 0;
      if (pending === 0) {
        return t.id.startsWith("chat_banter");
      }
      // Flow-aware template lanes
      if (money === "avoid" || phase === "open_banter") {
        return t.id.startsWith("chat_banter");
      }
      if (phase === "hard_nudge" || money === "require_light") {
        return t.id === "chat_hard" || t.id === "chat_roast" || t.id === "chat_topics";
      }
      if (phase === "bored_nudge" || money === "prefer") {
        return (
          t.id === "chat_topics" ||
          t.id === "chat_roast" ||
          t.id === "chat_1" ||
          t.id === "chat_2"
        );
      }
      // optional / aware
      return (
        t.id.startsWith("chat_banter") ||
        t.id === "chat_1" ||
        t.id === "chat_2"
      );
    }
    return true;
  });
  if (pool.length === 0) return null;
  const pick = pool[Math.floor(rng() * pool.length)]!;
  const text = renderPlaceholders(pick.body, packet);
  if (text.includes("{{")) return null;
  return { text, templateId: pick.id, style: pick.style, source: "template" };
}

export function renderPlaceholders(
  body: string,
  packet: PublicSafeFactPacket,
): string {
  const pf = packet.public_facts;
  const newW = pf.new_written ?? 0;
  const pending = pf.pending_count ?? pf.suggestion_count ?? 0;
  const topicLine = formatTopicLine(packet);
  // Templates that need topics skip when none exist (leave unrendered → null).
  if (body.includes("{{topic_line}}") && !topicLine) {
    return body;
  }
  const values: Record<string, string> = {
    new_written: String(newW),
    pending_count: String(pending),
    suggestion_count: String(pending),
    new_written_s: newW === 1 ? "" : "s",
    pending_s: pending === 1 ? "" : "s",
    topic_line: topicLine,
  };
  if (pf.currency && packet.allowed_placeholders.includes("currency")) {
    values.currency = pf.currency;
  }
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in values) return values[key]!;
    return `{{${key}}}`;
  });
}

function formatTopicLine(packet: PublicSafeFactPacket): string {
  const drafts = packet.public_facts.drafts ?? [];
  if (drafts.length) {
    return drafts
      .slice(0, 3)
      .map((d) =>
        d.amount
          ? `${d.label} ${d.amount}${d.currency ? ` ${d.currency}` : ""}`
          : d.label,
      )
      .join(", ");
  }
  const labels = packet.public_facts.draft_labels ?? [];
  return labels.slice(0, 3).join(", ");
}
