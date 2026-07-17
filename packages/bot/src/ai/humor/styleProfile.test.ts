import { describe, it, expect } from "vitest";
import {
  extractStyleFeatures,
  mergeVibeProfile,
  rankPreferredStyles,
} from "./styleProfile.js";
import { DEFAULT_GROUP_VIBE } from "@jemaw/shared/humor";

describe("extractStyleFeatures", () => {
  it("detects ethio-latin mix and emoji", () => {
    const f = extractStyleFeatures([
      { text: "dinner was great 😂", sentAt: new Date("2026-07-01") },
      { text: "ሒሳቡ አልጠፋም and more", sentAt: new Date("2026-07-02") },
      { text: "ok", sentAt: new Date("2026-07-02") },
    ]);
    expect(f.sampleMessageCount).toBe(3);
    expect(f.activeDayCount).toBe(2);
    expect(f.codeMixRate).toBeGreaterThan(0);
  });
});

describe("mergeVibeProfile", () => {
  it("promotes to active after enough samples", () => {
    const features = extractStyleFeatures(
      Array.from({ length: 25 }, (_, i) => ({
        text: `message number ${i} about dinner and rides`,
        sentAt: new Date(Date.UTC(2026, 6, 1 + (i % 5))),
      })),
    );
    const vibe = mergeVibeProfile(DEFAULT_GROUP_VIBE, features);
    expect(vibe.status).toBe("active");
    expect(vibe.preferredStyles.length).toBeGreaterThan(0);
  });
});

describe("rankPreferredStyles", () => {
  it("returns ordered style keys", () => {
    const ranked = rankPreferredStyles(DEFAULT_GROUP_VIBE.styleWeights, {
      funny: 0,
      not_for_us: 0,
      too_much: 0,
      wrong_tone: 0,
      wrong_fact: 0,
    });
    expect(ranked[0]).toBe("dry_observation");
  });
});
