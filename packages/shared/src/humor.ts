/**
 * Interactive humor types (Phases 1–4).
 * Settings + vibe live under groups.settings; prefs/feedback in dedicated tables.
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
  /** 0–1; higher allows less predictable candidates. */
  unpredictability: number;
  /** Try model candidates before templates when true. */
  useModelComposer: boolean;
  /** Use group vibe profile for tone matching (Phase 3). */
  useGroupVibe: boolean;
  /** Apply feedback-learned style weights (Phase 4). */
  usePreferenceLearning: boolean;
  enabledByMemberId?: string;
  enabledAt?: string;
  mutedUntil?: string;
  /**
   * After a hard-nudge ultimatum, social chat stays quiet until this time
   * (or until pending drafts drop). Scans still work.
   */
  chatSulkUntil?: string;
  /** Pending count when sulk started — clear sulk if backlog shrinks. */
  chatSulkPendingCount?: number;
};

/** Structured group vibe (Phase 3) — stored under groups.settings.vibe */
export type GroupVibeV1 = {
  version: 1;
  status: "insufficient_data" | "active" | "paused";
  sampleMessageCount: number;
  activeDayCount: number;
  languages: Array<{ code: string; weight: number }>;
  codeMixRate: number;
  medianMessageChars: number;
  emojiRate: number;
  formality: "low" | "medium" | "high";
  styleWeights: {
    dryObservation: number;
    gentleExaggeration: number;
    wordplay: number;
    selfAwareBot: number;
    aggressiveRoast: number;
    darkHumor: number;
    absurdity: number;
    classAndDebtHumor: number;
  };
  /** Phase 4: exponential moving average of feedback signals */
  feedbackWeights: {
    funny: number;
    not_for_us: number;
    too_much: number;
    wrong_tone: number;
    wrong_fact: number;
  };
  approvedCallbacks: Array<{
    text: string;
    approvedByMemberId: string;
    approvedAt: string;
  }>;
  preferredStyles: string[];
  updatedAt: string;
  expiresAt: string;
};

export type HumorMemberPrefsV1 = {
  contributeToStyleProfile: boolean;
  allowCallbackFromMessages: boolean;
  allowDirectReference: boolean;
  allowPublicFinancialRoasting: boolean;
  allowHardshipHumor: boolean;
  allowRelationshipHumor: boolean;
  allowSecurityIncidentHumor: boolean;
  allowProfanityTargeting: boolean;
};

export type HumorTriggerEvent =
  | "scan_hit"
  | "scan_miss"
  | "scan_still_pending"
  | "settlement_completed"
  | "batch_confirmed"
  | "correction"
  | "direct_mention"
  | "weekly_digest";

export type HumorChannel = "group" | "dm" | "ephemeral" | "mini_app";

export type HumorRiskClass = "green" | "yellow" | "red";

export type HumorDecision = "reply" | "do_not_reply";

/** One pending/new draft the model may joke about (group-visible review items). */
export type PublicSafeDraftFact = {
  label: string;
  /** Numeric string from DB if present; model may only repeat approved amounts. */
  amount?: string;
  currency?: string;
  /** Payer display name only when that member opted into direct reference. */
  payer_name?: string;
};

/** Facts the model may claim; grounded from authorized group DB rows. */
export type PublicSafeFactPacket = {
  event: HumorTriggerEvent;
  risk: HumorRiskClass;
  outcome:
    | "fresh_finds"
    | "still_pending"
    | "nothing_new"
    | "scan_miss"
    | "other";
  public_facts: {
    suggestion_count?: number;
    new_written?: number;
    pending_count?: number;
    categories?: string[];
    /** Short safe description snippets. */
    draft_labels?: string[];
    /** Concrete drafts with optional amounts (pending suggestions the group can already review). */
    drafts?: PublicSafeDraftFact[];
    currency?: string;
    settlement_count?: number;
    /** Active members in this group (count only; no private balances). */
    active_member_count?: number;
  };
  allowed_claims: string[];
  forbidden_claims: string[];
  /** Display names only for members who opted into direct reference. */
  allowed_target_names: string[];
  allowed_target_member_ids: string[];
  allowed_placeholders: string[];
  /**
   * All number tokens the model may emit (counts + draft amounts).
   * Verifier uses this as the allowlist.
   */
  allowed_number_tokens?: string[];
  /** Compact vibe summary for the model (no raw chat). */
  vibe_summary?: string;
  language_hint?: string;
  /**
   * Role for the model: short grounded group reply, not freeform invent-the-ledger chat.
   */
  reply_style_hint?: "scan_quip" | "grounded_companion" | "direct_chat";
  /**
   * Sanitized user message when they addressed Jemaw socially
   * (e.g. "hey what's up?"). Not a ledger claim.
   */
  addressed_utterance?: string;
  /**
   * Conversation-flow control so replies stay interactive instead of
   * re-listing expenses every turn.
   */
  conversation_flow?: ConversationFlowV1;
  /**
   * Recent jemaw↔group turns (oldest→newest), for follow-up continuity.
   * Sanitized short lines only — not full chat dump.
   */
  thread_turns?: ConversationThreadTurn[];
};

/** One turn in the recent jemaw conversation thread. */
export type ConversationThreadTurn = {
  role: "user" | "jemaw";
  text: string;
};

/**
 * How hard Jemaw should push money vs pure banter this turn.
 * Built deterministically from recent pokes, prior replies, and pending work.
 */
export type ConversationPhase =
  | "open_banter"
  | "aware_idle"
  | "bored_nudge"
  | "hard_nudge"
  | "scan_report";

export type MoneyMentionPolicy = "avoid" | "optional" | "prefer" | "require_light";

export type ConversationFlowV1 = {
  phase: ConversationPhase;
  /** Group pokes at jemaw in the last ~hour (messages containing jemaw). */
  poke_count_1h: number;
  /** How many of the last few bot replies already talked money/drafts. */
  recent_money_mention_streak: number;
  public_replies_today: number;
  max_public_replies_per_day: number;
  /** Near daily cap? model can reference being "busy / rate limited" lightly. */
  near_daily_cap: boolean;
  money_mention: MoneyMentionPolicy;
  /** Short directive string for the model. */
  directive: string;
  /**
   * After this hard_nudge reply is sent, backend will sulk (ignore social chat).
   * Model should treat this line as the last banter until backlog moves.
   */
  will_sulk_after?: boolean;
  /** Minutes of sulk the backend will apply (for the model to state accurately). */
  sulk_minutes?: number;
};

/** Default social sulk after a hard-nudge ultimatum (minutes). */
export const CHAT_SULK_MINUTES = 45;

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
  maxPublicRepliesPerDay: 50,
  cooldownMinutes: 0,
  languageMode: "auto",
  callbacks: "approved_only",
  publicFinancialRoasting: false,
  hardshipHumor: false,
  wealthAndClassHumor: false,
  latePaymentHumor: false,
  relationshipConflictHumor: false,
  resolvedSecurityIncidentHumor: false,
  profanity: "off",
  memberTargeting: "consenting_members",
  unpredictability: 0.3,
  useModelComposer: true,
  useGroupVibe: true,
  usePreferenceLearning: true,
};

export const DEFAULT_MEMBER_HUMOR_PREFS: HumorMemberPrefsV1 = {
  contributeToStyleProfile: true,
  allowCallbackFromMessages: false,
  allowDirectReference: false,
  allowPublicFinancialRoasting: false,
  allowHardshipHumor: false,
  allowRelationshipHumor: false,
  allowSecurityIncidentHumor: false,
  allowProfanityTargeting: false,
};

export const DEFAULT_GROUP_VIBE: GroupVibeV1 = {
  version: 1,
  status: "insufficient_data",
  sampleMessageCount: 0,
  activeDayCount: 0,
  languages: [{ code: "en", weight: 1 }],
  codeMixRate: 0,
  medianMessageChars: 40,
  emojiRate: 0,
  formality: "medium",
  styleWeights: {
    dryObservation: 0.5,
    gentleExaggeration: 0.2,
    wordplay: 0.15,
    selfAwareBot: 0.15,
    aggressiveRoast: 0.05,
    darkHumor: 0.05,
    absurdity: 0.1,
    classAndDebtHumor: 0.02,
  },
  feedbackWeights: {
    funny: 0,
    not_for_us: 0,
    too_much: 0,
    wrong_tone: 0,
    wrong_fact: 0,
  },
  approvedCallbacks: [],
  preferredStyles: ["dry_observation", "self_aware_bot"],
  updatedAt: new Date(0).toISOString(),
  expiresAt: new Date(0).toISOString(),
};

export function toHumorSettingsDto(s: HumorSettingsV1) {
  return {
    mode: s.mode,
    publicRepliesEnabled: s.publicRepliesEnabled,
    maxPublicRepliesPerDay: s.maxPublicRepliesPerDay,
    cooldownMinutes: s.cooldownMinutes,
    languageMode: s.languageMode,
    useModelComposer: s.useModelComposer,
    useGroupVibe: s.useGroupVibe,
    usePreferenceLearning: s.usePreferenceLearning,
    callbacks: s.callbacks,
    publicFinancialRoasting: s.publicFinancialRoasting,
    hardshipHumor: s.hardshipHumor,
    latePaymentHumor: s.latePaymentHumor,
    relationshipConflictHumor: s.relationshipConflictHumor,
    profanity: s.profanity,
    memberTargeting: s.memberTargeting,
    mutedUntil: s.mutedUntil ?? null,
  };
}

export function toGroupVibeDto(v: GroupVibeV1) {
  return {
    status: v.status,
    sampleMessageCount: v.sampleMessageCount,
    activeDayCount: v.activeDayCount,
    languages: v.languages,
    codeMixRate: v.codeMixRate,
    medianMessageChars: v.medianMessageChars,
    emojiRate: v.emojiRate,
    formality: v.formality,
    preferredStyles: v.preferredStyles,
    approvedCallbacks: v.approvedCallbacks.map((c) => ({
      text: c.text,
      approvedAt: c.approvedAt,
    })),
    feedbackWeights: v.feedbackWeights,
    updatedAt: v.updatedAt,
    expiresAt: v.expiresAt,
  };
}

/** Cooldown / daily caps by mode (passive events only). */
export const HUMOR_MODE_LIMITS: Record<
  Exclude<HumorMode, "off">,
  { maxPublicRepliesPerDay: number; cooldownMinutes: number }
> = {
  jemaw_dry: { maxPublicRepliesPerDay: 50, cooldownMinutes: 0 },
  roast: { maxPublicRepliesPerDay: 50, cooldownMinutes: 0 },
  chaos: { maxPublicRepliesPerDay: 100, cooldownMinutes: 0 },
};

/** Min messages / active days before vibe is "active". */
export const VIBE_MIN_MESSAGES = 20;
export const VIBE_MIN_ACTIVE_DAYS = 2;

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

export function parseGroupVibe(raw: unknown): GroupVibeV1 {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_GROUP_VIBE, styleWeights: { ...DEFAULT_GROUP_VIBE.styleWeights }, feedbackWeights: { ...DEFAULT_GROUP_VIBE.feedbackWeights }, languages: [...DEFAULT_GROUP_VIBE.languages], preferredStyles: [...DEFAULT_GROUP_VIBE.preferredStyles], approvedCallbacks: [] };
  }
  const o = raw as Partial<GroupVibeV1>;
  return {
    ...DEFAULT_GROUP_VIBE,
    ...o,
    version: 1,
    styleWeights: {
      ...DEFAULT_GROUP_VIBE.styleWeights,
      ...(o.styleWeights ?? {}),
    },
    feedbackWeights: {
      ...DEFAULT_GROUP_VIBE.feedbackWeights,
      ...(o.feedbackWeights ?? {}),
    },
    languages: o.languages?.length ? o.languages : DEFAULT_GROUP_VIBE.languages,
    preferredStyles: o.preferredStyles?.length
      ? o.preferredStyles
      : DEFAULT_GROUP_VIBE.preferredStyles,
    approvedCallbacks: o.approvedCallbacks ?? [],
  };
}

export function parseMemberHumorPrefs(raw: unknown): HumorMemberPrefsV1 {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEMBER_HUMOR_PREFS };
  return { ...DEFAULT_MEMBER_HUMOR_PREFS, ...(raw as object) } as HumorMemberPrefsV1;
}
