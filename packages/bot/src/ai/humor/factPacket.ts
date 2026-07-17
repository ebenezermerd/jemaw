/**
 * Build public-safe fact packets for humor composition.
 * Never includes raw ledger rows, private balances, or cross-group data.
 */
import type {
  HumorTriggerEvent,
  PublicSafeFactPacket,
  HumorRiskClass,
  GroupVibeV1,
} from "@jemaw/shared/humor";

export interface ScanHumorFacts {
  written: number;
  pendingCount: number;
  currency?: string;
  /** Safe short labels from pending/new suggestions (no amounts required). */
  draftLabels?: string[];
  categories?: string[];
  allowedTargetNames?: string[];
  allowedTargetMemberIds?: string[];
  vibe?: GroupVibeV1 | null;
  languageHint?: string;
}

export function buildScanOutcomePacket(input: ScanHumorFacts): PublicSafeFactPacket {
  const written = Math.max(0, Math.floor(input.written));
  const pending = Math.max(0, Math.floor(input.pendingCount));
  const labels = (input.draftLabels ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.slice(0, 40));
  const categories = (input.categories ?? []).filter(Boolean).slice(0, 5);

  let outcome: PublicSafeFactPacket["outcome"];
  let event: HumorTriggerEvent;
  if (written > 0) {
    outcome = "fresh_finds";
    event = "scan_hit";
  } else if (pending > 0) {
    outcome = "still_pending";
    event = "scan_still_pending";
  } else {
    outcome = "scan_miss";
    event = "scan_miss";
  }

  const risk: HumorRiskClass = "green";
  const placeholders = ["suggestion_count", "new_written", "pending_count"];
  const claims: string[] = [];
  if (written > 0) {
    claims.push(`${written} new draft${written === 1 ? "" : "s"} from this scan`);
  }
  if (pending > 0) {
    claims.push(`${pending} draft${pending === 1 ? "" : "s"} still waiting for review`);
  }
  if (written === 0 && pending === 0) {
    claims.push("no clear new expenses in the scan window");
  }
  if (labels.length) {
    claims.push(`draft topics include: ${labels.join(", ")}`);
  }
  if (categories.length) {
    claims.push(`categories: ${categories.join(", ")}`);
  }

  const vibe_summary = input.vibe ? summarizeVibe(input.vibe) : undefined;

  return {
    event,
    risk,
    outcome,
    public_facts: {
      suggestion_count: pending,
      new_written: written,
      pending_count: pending,
      categories: categories.length ? categories : undefined,
      draft_labels: labels.length ? labels : undefined,
      currency: input.currency,
    },
    allowed_claims: claims,
    forbidden_claims: [
      "any amount not listed as an allowed placeholder number",
      "any individual balance",
      "any information unavailable to the audience",
      "any motive or diagnosis not explicitly supported",
      "names of members not in allowed_target_names",
    ],
    allowed_target_names: input.allowedTargetNames ?? [],
    allowed_target_member_ids: input.allowedTargetMemberIds ?? [],
    allowed_placeholders: placeholders,
    vibe_summary,
    language_hint: input.languageHint,
  };
}

/** @deprecated use buildScanOutcomePacket */
export function buildScanHitPacket(input: {
  suggestionCount: number;
  categories?: string[];
  currency?: string;
}): PublicSafeFactPacket {
  return buildScanOutcomePacket({
    written: input.suggestionCount,
    pendingCount: input.suggestionCount,
    categories: input.categories,
    currency: input.currency,
  });
}

/** @deprecated use buildScanOutcomePacket */
export function buildScanMissPacket(): PublicSafeFactPacket {
  return buildScanOutcomePacket({ written: 0, pendingCount: 0 });
}

export function eventLabel(event: HumorTriggerEvent): string {
  return event;
}

function summarizeVibe(v: GroupVibeV1): string {
  const langs = v.languages
    .slice(0, 3)
    .map((l) => l.code)
    .join("+");
  const topStyles = Object.entries(v.styleWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join(", ");
  return [
    `status=${v.status}`,
    `formality=${v.formality}`,
    `langs=${langs || "en"}`,
    `emoji_rate=${v.emojiRate.toFixed(2)}`,
    `styles=${topStyles}`,
    v.preferredStyles.length
      ? `prefer=${v.preferredStyles.slice(0, 3).join(",")}`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
}
