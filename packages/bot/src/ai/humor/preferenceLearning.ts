/**
 * Phase 4: update structured preference weights from explicit feedback.
 * No model fine-tuning — only vibe.feedbackWeights + preferredStyles.
 */
import type { GroupVibeV1 } from "@jemaw/shared/humor";
import { parseGroupVibe } from "@jemaw/shared/humor";
import { rankPreferredStyles } from "./styleProfile.js";

export type FeedbackType =
  | "funny"
  | "not_for_us"
  | "too_much"
  | "wrong_tone"
  | "wrong_fact"
  | "mute"
  | "ban_phrase";

const EMA = 0.25;

export function applyFeedbackToVibe(
  previous: unknown,
  feedbackType: FeedbackType,
): GroupVibeV1 {
  const vibe = parseGroupVibe(previous);
  const fw = { ...vibe.feedbackWeights };

  const bump = (key: keyof typeof fw, amount = 1) => {
    fw[key] = Number((fw[key] * (1 - EMA) + amount * EMA).toFixed(4));
  };

  switch (feedbackType) {
    case "funny":
      bump("funny", 1);
      break;
    case "not_for_us":
      bump("not_for_us", 1);
      break;
    case "too_much":
      bump("too_much", 1);
      break;
    case "wrong_tone":
      bump("wrong_tone", 1);
      break;
    case "wrong_fact":
      bump("wrong_fact", 1);
      break;
    case "mute":
      bump("too_much", 1.5);
      bump("not_for_us", 1);
      break;
    case "ban_phrase":
      bump("not_for_us", 1);
      break;
    default:
      break;
  }

  // Soft-adjust style weights from feedback
  const sw = { ...vibe.styleWeights };
  if (feedbackType === "funny") {
    // reinforce top preferred styles slightly
    for (const s of vibe.preferredStyles.slice(0, 2)) {
      const key = styleKey(s);
      if (key) sw[key] = Math.min(1, sw[key] + 0.03);
    }
  }
  if (feedbackType === "too_much" || feedbackType === "mute") {
    sw.aggressiveRoast = Math.max(0.01, sw.aggressiveRoast - 0.05);
    sw.darkHumor = Math.max(0.01, sw.darkHumor - 0.04);
    sw.absurdity = Math.max(0.05, sw.absurdity - 0.03);
    sw.dryObservation = Math.min(1, sw.dryObservation + 0.05);
  }
  if (feedbackType === "wrong_tone") {
    sw.dryObservation = Math.min(1, sw.dryObservation + 0.04);
    sw.aggressiveRoast = Math.max(0.01, sw.aggressiveRoast - 0.04);
  }

  const preferredStyles = rankPreferredStyles(sw, fw);
  return {
    ...vibe,
    feedbackWeights: fw,
    styleWeights: sw,
    preferredStyles,
    updatedAt: new Date().toISOString(),
  };
}

function styleKey(
  s: string,
): keyof GroupVibeV1["styleWeights"] | null {
  const map: Record<string, keyof GroupVibeV1["styleWeights"]> = {
    dry_observation: "dryObservation",
    gentle_exaggeration: "gentleExaggeration",
    wordplay: "wordplay",
    self_aware_bot: "selfAwareBot",
    aggressive_roast: "aggressiveRoast",
    dark_humor: "darkHumor",
    absurdity: "absurdity",
    class_and_debt: "classAndDebtHumor",
  };
  return map[s] ?? null;
}

/** Whether learning suggests dialing down generative roast intensity. */
export function shouldPreferSaferTone(vibe: GroupVibeV1): boolean {
  const f = vibe.feedbackWeights;
  return f.too_much + f.wrong_tone + f.wrong_fact + f.not_for_us > f.funny + 0.3;
}
