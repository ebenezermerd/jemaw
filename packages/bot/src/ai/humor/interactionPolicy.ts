/**
 * Deterministic policy: mode, mute, cooldown, quota, risk.
 * Silence is a first-class outcome.
 */
import type {
  HumorSettingsV1,
  HumorPolicyDecision,
  PublicSafeFactPacket,
  HumorTriggerEvent,
} from "@jemaw/shared/humor";
import { HUMOR_MODE_LIMITS } from "@jemaw/shared/humor";

export interface PolicyContext {
  settings: HumorSettingsV1;
  factPacket: PublicSafeFactPacket;
  /** ISO or Date; if in the future, public humor is muted. */
  nowMs: number;
  /** Public replies already sent today (UTC day or group-local; caller defines). */
  publicRepliesToday: number;
  /** ms timestamp of last public humor reply, if any. */
  lastPublicReplyAtMs: number | null;
  /** True when the user explicitly invoked Jemaw (keyword/command/mention). */
  directInvocation: boolean;
}

const SCAN_MISS_NEEDS_INVOCATION = true;

export function evaluateHumorPolicy(ctx: PolicyContext): HumorPolicyDecision {
  const { settings, factPacket } = ctx;

  if (settings.mode === "off") {
    return { decision: "do_not_reply", reason: "mode_off" };
  }
  if (!settings.publicRepliesEnabled) {
    return { decision: "do_not_reply", reason: "public_replies_disabled" };
  }
  if (settings.mutedUntil) {
    const until = Date.parse(settings.mutedUntil);
    if (!Number.isNaN(until) && ctx.nowMs < until) {
      return { decision: "do_not_reply", reason: "group_muted" };
    }
  }
  if (factPacket.risk === "red") {
    return { decision: "do_not_reply", reason: "risk_red" };
  }

  // Direct "jemaw" / /jemaw / Mini App scan: always respond (no cooldown or
  // daily quota). Limits only apply to passive event-driven humor later.
  if (!ctx.directInvocation) {
    const limits = HUMOR_MODE_LIMITS[settings.mode];
    const maxDay =
      settings.maxPublicRepliesPerDay || limits.maxPublicRepliesPerDay;
    if (maxDay > 0 && ctx.publicRepliesToday >= maxDay) {
      return { decision: "do_not_reply", reason: "daily_quota" };
    }

    const cooldownMin =
      settings.cooldownMinutes ?? limits.cooldownMinutes;
    if (
      cooldownMin > 0 &&
      ctx.lastPublicReplyAtMs != null &&
      ctx.nowMs - ctx.lastPublicReplyAtMs < cooldownMin * 60_000
    ) {
      return { decision: "do_not_reply", reason: "cooldown" };
    }
  }

  if (
    SCAN_MISS_NEEDS_INVOCATION &&
    factPacket.event === "scan_miss" &&
    settings.mode === "jemaw_dry" &&
    !ctx.directInvocation
  ) {
    return { decision: "do_not_reply", reason: "scan_miss_requires_invocation" };
  }

  // Confirm-style micro events stay quiet in dry by default (matrix: Mini App only).
  if (isLowValueForDry(factPacket.event) && settings.mode === "jemaw_dry") {
    return { decision: "do_not_reply", reason: "low_value_event" };
  }

  return {
    decision: "reply",
    channel: "group",
    mode: settings.mode,
    factPacket,
  };
}

function isLowValueForDry(event: HumorTriggerEvent): boolean {
  return event === "batch_confirmed";
}
