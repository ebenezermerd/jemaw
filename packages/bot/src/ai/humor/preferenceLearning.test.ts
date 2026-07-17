import { describe, it, expect } from "vitest";
import {
  applyFeedbackToVibe,
  shouldPreferSaferTone,
} from "./preferenceLearning.js";
import { DEFAULT_GROUP_VIBE } from "@jemaw/shared/humor";

describe("applyFeedbackToVibe", () => {
  it("increases funny weight on funny feedback", () => {
    const v = applyFeedbackToVibe(DEFAULT_GROUP_VIBE, "funny");
    expect(v.feedbackWeights.funny).toBeGreaterThan(0);
  });

  it("dampens roast styles on too_much", () => {
    const base = {
      ...DEFAULT_GROUP_VIBE,
      styleWeights: {
        ...DEFAULT_GROUP_VIBE.styleWeights,
        aggressiveRoast: 0.4,
      },
    };
    let v = applyFeedbackToVibe(base, "too_much");
    v = applyFeedbackToVibe(v, "too_much");
    v = applyFeedbackToVibe(v, "wrong_tone");
    expect(v.styleWeights.aggressiveRoast).toBeLessThan(0.4);
    expect(shouldPreferSaferTone(v)).toBe(true);
  });
});
