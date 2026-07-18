/**
 * Build public-safe fact packets for humor composition.
 * Grounded in authorized group DB rows (pending drafts, consented names).
 * Never includes private balances, hardship detail, or cross-group data.
 */
import type {
  HumorTriggerEvent,
  PublicSafeFactPacket,
  PublicSafeDraftFact,
  HumorRiskClass,
  GroupVibeV1,
} from "@jemaw/shared/humor";

export interface ScanHumorFacts {
  written: number;
  pendingCount: number;
  currency?: string;
  /** Safe short labels from pending/new suggestions. */
  draftLabels?: string[];
  /** Concrete drafts (description + amount) already visible as group review items. */
  drafts?: PublicSafeDraftFact[];
  categories?: string[];
  allowedTargetNames?: string[];
  allowedTargetMemberIds?: string[];
  activeMemberCount?: number;
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

  const drafts = normalizeDrafts(input.drafts ?? [], input.currency);

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
  const placeholders = [
    "suggestion_count",
    "new_written",
    "pending_count",
    "currency",
  ];
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
  for (const d of drafts) {
    if (d.amount) {
      claims.push(
        `draft "${d.label}" amount ${d.amount}${d.currency ? ` ${d.currency}` : ""}`,
      );
    } else {
      claims.push(`draft "${d.label}"`);
    }
    if (d.payer_name) {
      claims.push(`draft "${d.label}" linked to ${d.payer_name}`);
    }
  }
  if (categories.length) {
    claims.push(`categories: ${categories.join(", ")}`);
  }
  if (input.activeMemberCount != null && input.activeMemberCount > 0) {
    claims.push(`${input.activeMemberCount} active members in this group`);
  }

  const allowed_number_tokens = collectAllowedNumberTokens({
    written,
    pending,
    drafts,
  });

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
      drafts: drafts.length ? drafts : undefined,
      currency: input.currency,
      active_member_count:
        input.activeMemberCount != null && input.activeMemberCount > 0
          ? input.activeMemberCount
          : undefined,
    },
    allowed_claims: claims,
    forbidden_claims: [
      "any amount not listed in drafts or public_facts counts",
      "any individual balance or net-owe figure",
      "any information unavailable to the audience",
      "any motive or diagnosis not explicitly supported",
      "names of members not in allowed_target_names",
      "private hardship, wealth ranking, or relationship drama",
    ],
    allowed_target_names: input.allowedTargetNames ?? [],
    allowed_target_member_ids: input.allowedTargetMemberIds ?? [],
    allowed_placeholders: placeholders,
    allowed_number_tokens,
    vibe_summary,
    language_hint: input.languageHint,
    reply_style_hint: "grounded_companion",
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

function normalizeDrafts(
  drafts: PublicSafeDraftFact[],
  defaultCurrency?: string,
): PublicSafeDraftFact[] {
  const out: PublicSafeDraftFact[] = [];
  for (const d of drafts.slice(0, 6)) {
    const label = (d.label ?? "").trim().slice(0, 48);
    if (!label) continue;
    const amount = normalizeAmountToken(d.amount);
    out.push({
      label,
      amount,
      currency: d.currency ?? defaultCurrency,
      payer_name: d.payer_name?.trim().slice(0, 40) || undefined,
    });
  }
  return out;
}

/** Strip trailing zeros for friendlier joke numbers while keeping exact token variants. */
export function normalizeAmountToken(
  raw: string | number | null | undefined,
): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  // Prefer "600" over "600.00" when whole; keep decimals when needed.
  if (s.includes(".")) {
    const n = Number(s);
    if (!Number.isFinite(n)) return undefined;
    if (Number.isInteger(n)) return String(n);
    return String(n);
  }
  return s;
}

export function collectAllowedNumberTokens(input: {
  written: number;
  pending: number;
  drafts: PublicSafeDraftFact[];
  extra?: Array<number | string | undefined | null>;
}): string[] {
  const set = new Set<string>();
  const add = (v: number | string | undefined | null) => {
    if (v == null || v === "") return;
    const s = String(v).trim();
    if (!s) return;
    set.add(s);
    // also allow integer form of 600.0
    if (/^\d+\.0+$/.test(s)) set.add(s.replace(/\.0+$/, ""));
    const n = Number(s);
    if (Number.isFinite(n) && Number.isInteger(n)) set.add(String(n));
  };
  add(input.written);
  add(input.pending);
  for (const d of input.drafts) add(d.amount);
  for (const e of input.extra ?? []) add(e);
  return [...set];
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
