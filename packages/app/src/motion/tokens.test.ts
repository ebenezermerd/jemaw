import { describe, it, expect } from "vitest";
import { pick, spring, collapsed } from "./tokens.js";

describe("motion tokens", () => {
  it("returns the real spring when motion is allowed", () => {
    expect(pick(spring.snap, false)).toBe(spring.snap);
  });

  it("collapses to a springless short transition under reduced motion", () => {
    const t = pick(spring.bouncy, true) as { duration?: number; type?: string };
    expect(t).toBe(collapsed);
    expect(t.duration).toBeLessThanOrEqual(0.08);
    // No spring physics when reduced.
    expect(t.type).toBeUndefined();
  });
});
