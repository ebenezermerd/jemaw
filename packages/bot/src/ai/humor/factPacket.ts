/**
 * Build public-safe fact packets for humor composition.
 * Never includes raw ledger rows, private balances, or cross-group data.
 */
import type {
  HumorTriggerEvent,
  PublicSafeFactPacket,
  HumorRiskClass,
} from "@jemaw/shared/humor";

export interface ScanHitFacts {
  suggestionCount: number;
  categories?: string[];
  currency?: string;
}

export function buildScanHitPacket(input: ScanHitFacts): PublicSafeFactPacket {
  const count = Math.max(0, Math.floor(input.suggestionCount));
  const categories = (input.categories ?? []).filter(Boolean).slice(0, 5);
  const risk: HumorRiskClass = count > 0 ? "green" : "green";
  return {
    event: "scan_hit",
    risk,
    public_facts: {
      suggestion_count: count,
      categories: categories.length ? categories : undefined,
      currency: input.currency,
    },
    allowed_claims: [
      `${count} suggestion${count === 1 ? "" : "s"} were found`,
      ...(categories.length
        ? [`categories represented: ${categories.join(", ")}`]
        : []),
    ],
    forbidden_claims: [
      "any amount not present in approved facts",
      "any individual balance",
      "any information unavailable to the audience",
      "any motive or diagnosis not explicitly supported",
    ],
    allowed_target_member_ids: [],
    allowed_placeholders: ["suggestion_count"],
  };
}

export function buildScanMissPacket(): PublicSafeFactPacket {
  return {
    event: "scan_miss",
    risk: "green",
    public_facts: { suggestion_count: 0 },
    allowed_claims: ["no clear expenses were found in the scan window"],
    forbidden_claims: [
      "any amount not present in approved facts",
      "any individual balance",
    ],
    allowed_target_member_ids: [],
    allowed_placeholders: [],
  };
}

export function eventLabel(event: HumorTriggerEvent): string {
  return event;
}
