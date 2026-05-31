import { describe, it, expect } from "vitest";
import { computeSplit } from "./splits.js";

const sum = (s: { shareCents: number }[]) =>
  s.reduce((a, b) => a + b.shareCents, 0);

describe("computeSplit — equal", () => {
  it("splits evenly when divisible", () => {
    const r = computeSplit({
      totalCents: 1200,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
      expenseSeed: "x",
    });
    expect(r.map((x) => x.shareCents)).toEqual([400, 400, 400]);
  });

  it("distributes remainder cents and still sums to total", () => {
    const r = computeSplit({
      totalCents: 1000,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
      expenseSeed: "seed-1",
    });
    expect(sum(r)).toBe(1000);
    // one member gets 334, two get 333
    expect(r.map((x) => x.shareCents).sort()).toEqual([333, 333, 334]);
  });

  it("remainder bearer is deterministic for the same seed", () => {
    const a = computeSplit({
      totalCents: 1000,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
      expenseSeed: "same",
    });
    const b = computeSplit({
      totalCents: 1000,
      splitType: "equal",
      memberIds: ["a", "b", "c"],
      expenseSeed: "same",
    });
    expect(a).toEqual(b);
  });
});

describe("computeSplit — shares", () => {
  it("weights by share counts and sums to total", () => {
    const r = computeSplit({
      totalCents: 1000,
      splitType: "shares",
      memberIds: ["a", "b"],
      shares: { a: 3, b: 1 },
      expenseSeed: "s",
    });
    expect(sum(r)).toBe(1000);
    expect(r.find((x) => x.memberId === "a")!.shareCents).toBe(750);
    expect(r.find((x) => x.memberId === "b")!.shareCents).toBe(250);
  });

  it("rejects non-positive share", () => {
    expect(() =>
      computeSplit({
        totalCents: 1000,
        splitType: "shares",
        memberIds: ["a", "b"],
        shares: { a: 1, b: 0 },
        expenseSeed: "s",
      }),
    ).toThrow();
  });
});

describe("computeSplit — exact", () => {
  it("accepts exact amounts that sum to total", () => {
    const r = computeSplit({
      totalCents: 1000,
      splitType: "exact",
      memberIds: ["a", "b"],
      exactCents: { a: 700, b: 300 },
      expenseSeed: "s",
    });
    expect(r.find((x) => x.memberId === "a")!.shareCents).toBe(700);
  });

  it("rejects when exact amounts do not sum to total", () => {
    expect(() =>
      computeSplit({
        totalCents: 1000,
        splitType: "exact",
        memberIds: ["a", "b"],
        exactCents: { a: 700, b: 200 },
        expenseSeed: "s",
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
        expenseSeed: "s",
      }),
    ).toThrow();
  });
  it("rejects non-positive total", () => {
    expect(() =>
      computeSplit({
        totalCents: 0,
        splitType: "equal",
        memberIds: ["a"],
        expenseSeed: "s",
      }),
    ).toThrow();
  });
});
