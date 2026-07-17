/**
 * Phase 3: extract safe group style features from recent messages and merge
 * into a structured vibe profile (no raw unbounded embeddings).
 */
import {
  type GroupVibeV1,
  DEFAULT_GROUP_VIBE,
  VIBE_MIN_MESSAGES,
  VIBE_MIN_ACTIVE_DAYS,
  parseGroupVibe,
} from "@jemaw/shared/humor";

export interface StyleSampleMessage {
  text: string;
  sentAt: Date;
  /** When false, exclude from vibe learning (member opted out). */
  contribute?: boolean;
}

const ETHIOPIC = /[\u1200-\u137F]/;
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function extractStyleFeatures(messages: StyleSampleMessage[]): {
  sampleMessageCount: number;
  activeDayCount: number;
  languages: Array<{ code: string; weight: number }>;
  codeMixRate: number;
  medianMessageChars: number;
  emojiRate: number;
  formality: "low" | "medium" | "high";
  styleWeights: GroupVibeV1["styleWeights"];
} {
  const usable = messages.filter(
    (m) => m.contribute !== false && m.text.trim().length > 0,
  );
  if (usable.length === 0) {
    return {
      sampleMessageCount: 0,
      activeDayCount: 0,
      languages: [{ code: "en", weight: 1 }],
      codeMixRate: 0,
      medianMessageChars: 40,
      emojiRate: 0,
      formality: "medium",
      styleWeights: { ...DEFAULT_GROUP_VIBE.styleWeights },
    };
  }

  let eth = 0;
  let latin = 0;
  let mixed = 0;
  let emojiMsgs = 0;
  const lengths: number[] = [];
  const days = new Set<string>();

  for (const m of usable) {
    const t = m.text;
    lengths.push(t.length);
    days.add(m.sentAt.toISOString().slice(0, 10));
    const hasEth = ETHIOPIC.test(t);
    const hasLat = /[A-Za-z]{2,}/.test(t);
    if (hasEth) eth++;
    if (hasLat) latin++;
    if (hasEth && hasLat) mixed++;
    if (EMOJI.test(t)) emojiMsgs++;
  }

  const n = usable.length;
  const codeMixRate = mixed / n;
  const emojiRate = emojiMsgs / n;
  lengths.sort((a, b) => a - b);
  const medianMessageChars = lengths[Math.floor(lengths.length / 2)] ?? 40;

  const languages: Array<{ code: string; weight: number }> = [];
  if (latin / n >= 0.15) languages.push({ code: "en", weight: latin / n });
  if (eth / n >= 0.1) languages.push({ code: "am", weight: eth / n });
  if (!languages.length) languages.push({ code: "en", weight: 1 });
  const sum = languages.reduce((s, l) => s + l.weight, 0) || 1;
  for (const l of languages) l.weight = Number((l.weight / sum).toFixed(3));

  // Formality heuristic: longer msgs + fewer emojis → higher formality
  let formality: "low" | "medium" | "high" = "medium";
  if (medianMessageChars < 35 || emojiRate > 0.35) formality = "low";
  else if (medianMessageChars > 90 && emojiRate < 0.1) formality = "high";

  const styleWeights = { ...DEFAULT_GROUP_VIBE.styleWeights };
  if (formality === "low") {
    styleWeights.absurdity += 0.1;
    styleWeights.gentleExaggeration += 0.08;
    styleWeights.dryObservation = Math.max(0.15, styleWeights.dryObservation - 0.1);
  }
  if (formality === "high") {
    styleWeights.dryObservation += 0.15;
    styleWeights.aggressiveRoast = Math.max(0.02, styleWeights.aggressiveRoast - 0.05);
  }
  if (codeMixRate > 0.15) {
    styleWeights.wordplay += 0.05;
  }
  if (emojiRate > 0.25) {
    styleWeights.selfAwareBot += 0.05;
  }

  return {
    sampleMessageCount: n,
    activeDayCount: days.size,
    languages,
    codeMixRate: Number(codeMixRate.toFixed(3)),
    medianMessageChars,
    emojiRate: Number(emojiRate.toFixed(3)),
    formality,
    styleWeights,
  };
}

/** EMA merge of new features into existing vibe. */
export function mergeVibeProfile(
  previous: unknown,
  features: ReturnType<typeof extractStyleFeatures>,
  now = new Date(),
): GroupVibeV1 {
  const prev = parseGroupVibe(previous);
  const alpha = 0.35; // recent window weight
  const blend = (a: number, b: number) =>
    Number((a * (1 - alpha) + b * alpha).toFixed(4));

  const styleWeights = { ...prev.styleWeights };
  for (const k of Object.keys(styleWeights) as (keyof typeof styleWeights)[]) {
    styleWeights[k] = blend(prev.styleWeights[k], features.styleWeights[k]);
  }

  const sampleMessageCount = Math.max(
    prev.sampleMessageCount,
    features.sampleMessageCount,
  );
  const activeDayCount = Math.max(prev.activeDayCount, features.activeDayCount);
  const eligible =
    sampleMessageCount >= VIBE_MIN_MESSAGES &&
    activeDayCount >= VIBE_MIN_ACTIVE_DAYS;

  const preferredStyles = rankPreferredStyles(styleWeights, prev.feedbackWeights);

  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 90);

  return {
    ...prev,
    version: 1,
    status: eligible ? "active" : "insufficient_data",
    sampleMessageCount,
    activeDayCount,
    languages: features.languages.length ? features.languages : prev.languages,
    codeMixRate: blend(prev.codeMixRate, features.codeMixRate),
    medianMessageChars: Math.round(
      blend(prev.medianMessageChars, features.medianMessageChars),
    ),
    emojiRate: blend(prev.emojiRate, features.emojiRate),
    formality: features.formality,
    styleWeights,
    preferredStyles,
    updatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export function rankPreferredStyles(
  styleWeights: GroupVibeV1["styleWeights"],
  feedback: GroupVibeV1["feedbackWeights"],
): string[] {
  // Phase 4 nudge: reduce aggressive styles if too_much / wrong_tone high
  const damp =
    1 -
    Math.min(
      0.5,
      (feedback.too_much + feedback.wrong_tone + feedback.not_for_us) * 0.15,
    );
  const boost = 1 + Math.min(0.4, feedback.funny * 0.2);

  const scored: Array<[string, number]> = [
    ["dry_observation", styleWeights.dryObservation * boost],
    ["gentle_exaggeration", styleWeights.gentleExaggeration * boost],
    ["wordplay", styleWeights.wordplay * boost],
    ["self_aware_bot", styleWeights.selfAwareBot * boost],
    ["aggressive_roast", styleWeights.aggressiveRoast * damp],
    ["dark_humor", styleWeights.darkHumor * damp],
    ["absurdity", styleWeights.absurdity * boost],
  ];
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, 4).map(([k]) => k);
}

export function pickStyleSamples(
  messages: StyleSampleMessage[],
  limit = 6,
): string[] {
  return messages
    .filter((m) => m.contribute !== false)
    .map((m) => m.text.trim().replace(/\s+/g, " ").slice(0, 120))
    .filter((t) => t.length >= 8 && t.length <= 120)
    .slice(-limit);
}
