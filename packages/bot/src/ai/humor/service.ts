/**
 * Humor orchestration: policy → model → templates → verify.
 */
import type {
  HumorSettingsV1,
  PublicSafeFactPacket,
  GroupVibeV1,
} from "@jemaw/shared/humor";
import type { ScanClient } from "../geminiClient.js";
import { evaluateHumorPolicy, type PolicyContext } from "./interactionPolicy.js";
import { composeFromTemplates } from "./templateComposer.js";
import {
  composeModelCandidates,
  HUMOR_PROMPT_VERSION,
} from "./modelComposer.js";
import { isTooSimilar, verifyCandidate } from "./verifier.js";

export type HumorComposeResult =
  | { decision: "do_not_reply"; reason: string }
  | {
      decision: "reply";
      channel: "group" | "dm" | "ephemeral" | "mini_app";
      mode: HumorSettingsV1["mode"];
      text: string;
      style: string;
      source: "template" | "model";
      templateId: string | null;
      factPacket: PublicSafeFactPacket;
      candidates: string[];
      provider?: string;
      model?: string;
      promptVersion?: string;
      inputTokens?: number;
      outputTokens?: number;
    };

export async function composeHumorReply(input: {
  settings: HumorSettingsV1;
  factPacket: PublicSafeFactPacket;
  nowMs: number;
  publicRepliesToday: number;
  lastPublicReplyAtMs: number | null;
  directInvocation: boolean;
  recentReplyTexts: string[];
  humorClient?: ScanClient;
  humorProvider?: string;
  humorModel?: string;
  vibe?: GroupVibeV1 | null;
  styleSamples?: string[];
  rng?: () => number;
}): Promise<HumorComposeResult> {
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

  const candidates: string[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const allowRepeat = input.directInvocation;

  const useModel =
    input.settings.useModelComposer &&
    input.humorClient &&
    (input.settings.useGroupVibe || true);

  if (useModel && input.humorClient) {
    const modelOut = await composeModelCandidates({
      client: input.humorClient,
      mode: policy.mode,
      packet: policy.factPacket,
      vibe: input.settings.useGroupVibe ? input.vibe : null,
      styleSamples:
        input.settings.useGroupVibe && input.vibe?.status === "active"
          ? input.styleSamples
          : undefined,
    });
    inputTokens = modelOut.inputTokens;
    outputTokens = modelOut.outputTokens;
    for (const c of modelOut.candidates) {
      candidates.push(c.text);
      if (!allowRepeat && isTooSimilar(c.text, input.recentReplyTexts)) continue;
      const v = verifyCandidate(c.text, policy.factPacket);
      if (!v.ok) continue;
      return {
        decision: "reply",
        channel: policy.channel,
        mode: policy.mode,
        text: c.text,
        style: c.style,
        source: "model",
        templateId: null,
        factPacket: policy.factPacket,
        candidates,
        provider: input.humorProvider,
        model: input.humorModel,
        promptVersion: HUMOR_PROMPT_VERSION,
        inputTokens,
        outputTokens,
      };
    }
  }

  const tpl = composeFromTemplates(policy.mode, policy.factPacket, input.rng);
  if (!tpl) {
    return { decision: "do_not_reply", reason: "no_template" };
  }
  if (!allowRepeat && isTooSimilar(tpl.text, input.recentReplyTexts)) {
    const tpl2 = composeFromTemplates(policy.mode, policy.factPacket, () =>
      Math.random(),
    );
    if (!tpl2 || isTooSimilar(tpl2.text, input.recentReplyTexts)) {
      return { decision: "do_not_reply", reason: "repetition" };
    }
    candidates.push(tpl2.text);
    return {
      decision: "reply",
      channel: policy.channel,
      mode: policy.mode,
      text: tpl2.text,
      style: tpl2.style,
      source: "template",
      templateId: tpl2.templateId,
      factPacket: policy.factPacket,
      candidates,
      inputTokens,
      outputTokens,
    };
  }
  candidates.push(tpl.text);
  return {
    decision: "reply",
    channel: policy.channel,
    mode: policy.mode,
    text: tpl.text,
    style: tpl.style,
    source: "template",
    templateId: tpl.templateId,
    factPacket: policy.factPacket,
    candidates,
    inputTokens,
    outputTokens,
  };
}
