/**
 * Template composer for Phase 1 + fallback for Phase 2.
 * Placeholders like {{suggestion_count}} are filled from the fact packet only.
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
  // scan_hit
  {
    id: "dry_scan_hit_1",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "{{suggestion_count}} expenses found. The spreadsheet may stand down.",
    style: "dry_observation",
  },
  {
    id: "dry_scan_hit_2",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "{{suggestion_count}} drafts ready. Open Jemaw when you are.",
    style: "dry_observation",
  },
  {
    id: "dry_scan_hit_3",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Caught {{suggestion_count}} possible expenses. The receipts have formed a small committee.",
    style: "dry_observation",
  },
  {
    id: "dry_scan_hit_4",
    event: "scan_hit",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "{{suggestion_count}} items noticed. Confirm when the chaos settles.",
    style: "dry_observation",
  },
  {
    id: "roast_scan_hit_1",
    event: "scan_hit",
    modes: ["roast", "chaos"],
    body: "{{suggestion_count}} expenses spotted. Someone has been productive with money.",
    style: "roast",
  },
  {
    id: "chaos_scan_hit_1",
    event: "scan_hit",
    modes: ["chaos"],
    body: "{{suggestion_count}} expenses materialised. The ledger is having a day.",
    style: "chaos",
  },
  // scan_miss
  {
    id: "dry_scan_miss_1",
    event: "scan_miss",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Nothing clear enough to record. A rare victory for ambiguity.",
    style: "dry_observation",
  },
  {
    id: "dry_scan_miss_2",
    event: "scan_miss",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "No clean expenses in the window. The books stay quiet.",
    style: "dry_observation",
  },
  {
    id: "roast_scan_miss_1",
    event: "scan_miss",
    modes: ["roast", "chaos"],
    body: "Scan complete. Either you are thrifty or very subtle.",
    style: "roast",
  },
  // settlement
  {
    id: "dry_settlement_1",
    event: "settlement_completed",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Settled. The ledger has stopped holding a grudge.",
    style: "dry_observation",
  },
  {
    id: "dry_settlement_2",
    event: "settlement_completed",
    modes: ["jemaw_dry", "roast", "chaos"],
    body: "Payment recorded. Diplomatic relations restored.",
    style: "dry_observation",
  },
  {
    id: "roast_settlement_1",
    event: "settlement_completed",
    modes: ["roast", "chaos"],
    body: "Settled. One less plot line in the group chat.",
    style: "roast",
  },
];

export function composeFromTemplates(
  mode: HumorMode,
  packet: PublicSafeFactPacket,
  rng: () => number = Math.random,
): TemplateReply | null {
  if (mode === "off") return null;
  const pool = TEMPLATES.filter(
    (t) => t.event === packet.event && t.modes.includes(mode),
  );
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
  const values: Record<string, string> = {};
  if (
    packet.public_facts.suggestion_count != null &&
    packet.allowed_placeholders.includes("suggestion_count")
  ) {
    values.suggestion_count = String(packet.public_facts.suggestion_count);
  }
  if (
    packet.public_facts.currency &&
    packet.allowed_placeholders.includes("currency")
  ) {
    values.currency = packet.public_facts.currency;
  }
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in values) return values[key]!;
    return `{{${key}}}`;
  });
}
