/**
 * Humor service entry: policy + template compose.
 * Delivery and persistence are wired in later Phase 1 steps.
 */
import type { HumorSettingsV1 } from "@jemaw/shared/humor";
import { evaluateHumorPolicy, type PolicyContext } from "./interactionPolicy.js";
import { composeFromTemplates, type TemplateReply } from "./templateComposer.js";
import type { PublicSafeFactPacket } from "@jemaw/shared/humor";

export type HumorComposeResult =
  | { decision: "do_not_reply"; reason: string }
  | {
      decision: "reply";
      channel: "group" | "dm" | "ephemeral" | "mini_app";
      mode: HumorSettingsV1["mode"];
      reply: TemplateReply;
      factPacket: PublicSafeFactPacket;
    };

export function composeHumorReply(input: {
  settings: HumorSettingsV1;
  factPacket: PublicSafeFactPacket;
  nowMs: number;
  publicRepliesToday: number;
  lastPublicReplyAtMs: number | null;
  directInvocation: boolean;
  rng?: () => number;
}): HumorComposeResult {
  const policyCtx: PolicyContext = {
    settings: input.settings,
    factPacket: input.factPacket,
    nowMs: input.nowMs,
    publicRepliesToday: input.publicRepliesToday,
    lastPublicReplyAtMs: input.lastPublicReplyAtMs,
    directInvocation: input.directInvocation,
  };
  const policy = evaluateHumorPolicy(policyCtx);
  if (policy.decision === "do_not_reply") {
    return { decision: "do_not_reply", reason: policy.reason };
  }
  const reply = composeFromTemplates(policy.mode, policy.factPacket, input.rng);
  if (!reply) {
    return { decision: "do_not_reply", reason: "no_template" };
  }
  return {
    decision: "reply",
    channel: policy.channel,
    mode: policy.mode,
    reply,
    factPacket: policy.factPacket,
  };
}
