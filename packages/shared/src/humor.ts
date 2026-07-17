/**
 * Interactive humor types (Phase 1). Settings live in groups.settings.humor.
 * See docs/Jemaw_Interactive_Humor_Final.md.
 */

export type HumorMode = "off" | "jemaw_dry" | "roast" | "chaos";

export type HumorLanguageMode = "auto" | "en" | "am" | "code_mix";

export type HumorProfanity = "off" | "moderate" | "match_group";

export type HumorMemberTargeting = "group_only" | "consenting_members";

/** Stored under groups.settings.humor */
export type HumorSettingsV1 = {
  version: 1;
  mode: HumorMode;
  publicRepliesEnabled: boolean;
  maxPublicRepliesPerDay: number;
  cooldownMinutes: number;
  languageMode: HumorLanguageMode;
  callbacks: "off" | "approved_only";
  publicFinancialRoasting: boolean;
  hardshipHumor: boolean;
  wealthAndClassHumor: boolean;
  latePaymentHumor: boolean;
  relationshipConflictHumor: boolean;
  resolvedSecurityIncidentHumor: boolean;
  profanity: HumorProfanity;
  memberTargeting: HumorMemberTargeting;
  /** 0–1; higher allows less predictable templates/candidates in later phases. */
  unpredictability: number;
  /** Phase 2: try model candidates before templates when true. */
  useModelComposer: boolean;
  enabledByMemberId?: string;
  enabledAt?: string;
  mutedUntil?: string;
};

export type HumorTriggerEvent =
  | "scan_hit"
  | "scan_miss"
  | "settlement_completed"
  | "batch_confirmed"
  | "correction"
  | "direct_mention"
  | "weekly_digest";

export type HumorChannel = "group" | "dm" | "ephemeral" | "mini_app";

export type HumorRiskClass = "green" | "yellow" | "red";

export type HumorDecision = "reply" | "do_not_reply";

/** Facts the model may claim; numbers rendered via placeholders by the backend. */
export type PublicSafeFactPacket = {
  event: HumorTriggerEvent;
  risk: HumorRiskClass;
  public_facts: {
    suggestion_count?: number;
    categories?: string[];
    currency?: string;
    settlement_count?: number;
  };
  allowed_claims: string[];
  forbidden_claims: string[];
  /** Empty unless member targeting is allowed and consented. */
  allowed_target_member_ids: string[];
  /** Placeholder keys the composer may use (e.g. suggestion_count). */
  allowed_placeholders: string[];
};

export type HumorPolicyDecision =
  | {
      decision: "do_not_reply";
      reason: string;
    }
  | {
      decision: "reply";
      channel: HumorChannel;
      mode: HumorMode;
      factPacket: PublicSafeFactPacket;
    };

export const DEFAULT_HUMOR_SETTINGS: HumorSettingsV1 = {
  version: 1,
  mode: "off",
  publicRepliesEnabled: true,
  // Caps only apply to passive events; direct "jemaw" is unlimited.
  maxPublicRepliesPerDay: 50,
  cooldownMinutes: 0,
  languageMode: "auto",
  callbacks: "off",
  publicFinancialRoasting: false,
  hardshipHumor: false,
  wealthAndClassHumor: false,
  latePaymentHumor: false,
  relationshipConflictHumor: false,
  resolvedSecurityIncidentHumor: false,
  profanity: "off",
  memberTargeting: "group_only",
  unpredictability: 0,
  useModelComposer: true,
};

export function toHumorSettingsDto(s: HumorSettingsV1): {
  mode: HumorMode;
  publicRepliesEnabled: boolean;
  maxPublicRepliesPerDay: number;
  cooldownMinutes: number;
  languageMode: HumorLanguageMode;
  useModelComposer: boolean;
  mutedUntil: string | null;
} {
  return {
    mode: s.mode,
    publicRepliesEnabled: s.publicRepliesEnabled,
    maxPublicRepliesPerDay: s.maxPublicRepliesPerDay,
    cooldownMinutes: s.cooldownMinutes,
    languageMode: s.languageMode,
    useModelComposer: s.useModelComposer,
    mutedUntil: s.mutedUntil ?? null,
  };
}

/** Cooldown / daily caps by mode (product defaults). */
export const HUMOR_MODE_LIMITS: Record<
  Exclude<HumorMode, "off">,
  { maxPublicRepliesPerDay: number; cooldownMinutes: number }
> = {
  // Passive-event fallbacks only. Direct jemaw mentions ignore these.
  jemaw_dry: { maxPublicRepliesPerDay: 50, cooldownMinutes: 0 },
  roast: { maxPublicRepliesPerDay: 50, cooldownMinutes: 0 },
  chaos: { maxPublicRepliesPerDay: 100, cooldownMinutes: 0 },
};

export function parseHumorSettings(raw: unknown): HumorSettingsV1 {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HUMOR_SETTINGS };
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (mode !== "off" && mode !== "jemaw_dry" && mode !== "roast" && mode !== "chaos") {
    return { ...DEFAULT_HUMOR_SETTINGS };
  }
  return {
    ...DEFAULT_HUMOR_SETTINGS,
    ...o,
    version: 1,
    mode,
  } as HumorSettingsV1;
}
