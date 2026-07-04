import { describe, it, expect } from "vitest";
import { computeSplit } from "./splits.js";

const sum = (s: { shareCents: number }[]) =>
  s.reduce((a, b) => a + b.shareCents, 0);

describe("computeSplit — equal", () => {
  it("splits evenly when divisible into whole units", () => {
    const r = computeSplit({
      totalCents: 1200,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
    });
    expect(r.map((x) => x.shareCents)).toEqual([400, 400, 400]);
  });

  it("floors every share to a whole unit and lets the payer absorb the rest", () => {
    // 10.00 across 3 → 3.00 each; the leftover 1.00 is never assigned.
    const r = computeSplit({
      totalCents: 1000,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
    });
    expect(r.map((x) => x.shareCents)).toEqual([300, 300, 300]);
    expect(sum(r)).toBe(900);
  });

  it("never assigns cents even when the total carries them", () => {
    // 100.50 across 4 → 25.00 each, payer absorbs 0.50.
    const r = computeSplit({
      totalCents: 10050,
      splitType: "equal",
      memberIds: ["a", "b", "c", "d"],
    });
    expect(r.every((x) => x.shareCents % 100 === 0)).toBe(true);
    expect(sum(r)).toBe(10000);
  });

  it("floors to zero shares when the total is below one unit per member", () => {
    const r = computeSplit({
      totalCents: 150,
      splitType: "equal",
      memberIds: ["a", "b"],
    });
    expect(r.map((x) => x.shareCents)).toEqual([0, 0]);
  });
});

describe("computeSplit — shares", () => {
  it("weights by share counts in whole units", () => {
    const r = computeSplit({
      totalCents: 1000,
      splitType: "shares",
      memberIds: ["a", "b"],
      shares: { a: 3, b: 1 },
    });
    expect(r.find((x) => x.memberId === "a")!.shareCents).toBe(700);
    expect(r.find((x) => x.memberId === "b")!.shareCents).toBe(200);
    expect(sum(r)).toBe(900);
  });

  it("keeps exact weighted amounts when they divide into whole units", () => {
    const r = computeSplit({
      totalCents: 1200,
      splitType: "shares",
      memberIds: ["a", "b"],
      shares: { a: 2, b: 1 },
    });
    expect(r.find((x) => x.memberId === "a")!.shareCents).toBe(800);
    expect(r.find((x) => x.memberId === "b")!.shareCents).toBe(400);
    expect(sum(r)).toBe(1200);
  });

  it("rejects non-positive share", () => {
    expect(() =>
      computeSplit({
        totalCents: 1000,
        splitType: "shares",
        memberIds: ["a", "b"],
        shares: { a: 1, b: 0 },
      }),
    ).toThrow();
  });
});

describe("computeSplit — exact", () => {
  it("accepts exact amounts that sum to total, cents included", () => {
    const r = computeSplit({
      totalCents: 1000,
      splitType: "exact",
      memberIds: ["a", "b"],
      exactCents: { a: 750, b: 250 },
    });
    expect(r.find((x) => x.memberId === "a")!.shareCents).toBe(750);
  });

  it("rejects when exact amounts do not sum to total", () => {
    expect(() =>
      computeSplit({
        totalCents: 1000,
        splitType: "exact",
        memberIds: ["a", "b"],
        exactCents: { a: 700, b: 200 },
      }),
    ).toThrow(/sum to total/);
  });
});

describe("computeSplit — guards", () => {
  it("rejects empty members", () => {
    expect(() =>
      computeSplit({
        totalCents: 1000,
        splitType: "equal",
        memberIds: [],
      }),
    ).toThrow();
  });
  it("rejects non-positive total", () => {
    expect(() =>
      computeSplit({
        totalCents: 0,
        splitType: "equal",
        memberIds: ["a"],
      }),
    ).toThrow();
  });
});
