import { describe, it, expect } from "vitest";
import { computeSettlement } from "./settle.js";
import type { MemberNet } from "./balances.js";

const sumTransfers = (t: { amountCents: number }[]) =>
  t.reduce((a, b) => a + b.amountCents, 0);

describe("computeSettlement", () => {
  it("returns no transfers when everyone is even", () => {
    const nets: MemberNet[] = [
      { memberId: "a", netCents: 0 },
      { memberId: "b", netCents: 0 },
    ];
    expect(computeSettlement(nets)).toEqual([]);
  });

  it("settles a single debtor and creditor", () => {
    const nets: MemberNet[] = [
      { memberId: "a", netCents: 1500 },
      { memberId: "b", netCents: -1500 },
    ];
    expect(computeSettlement(nets)).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountCents: 1500 },
    ]);
  });

  it("matches largest creditor with largest debtor", () => {
    // Sara +4850, You +1200, Tom -1800, Mia -4250
    const nets: MemberNet[] = [
      { memberId: "sara", netCents: 4850 },
      { memberId: "you", netCents: 1200 },
      { memberId: "tom", netCents: -1800 },
      { memberId: "mia", netCents: -4250 },
    ];
    const t = computeSettlement(nets);
    // Total transferred equals total debt.
    expect(sumTransfers(t)).toBe(1800 + 4250);
    // Largest debtor (mia) pays largest creditor (sara) first.
    expect(t[0]).toEqual({
      fromMemberId: "mia",
      toMemberId: "sara",
      amountCents: 4250,
    });
    // Every net is resolved by the transfers.
    const delta = new Map(nets.map((n) => [n.memberId, n.netCents]));
    for (const x of t) {
      delta.set(x.fromMemberId, (delta.get(x.fromMemberId) ?? 0) + x.amountCents);
      delta.set(x.toMemberId, (delta.get(x.toMemberId) ?? 0) - x.amountCents);
    }
    for (const v of delta.values()) expect(v).toBe(0);
  });

  it("is deterministic for tied magnitudes (memberId tie-break)", () => {
    const nets: MemberNet[] = [
      { memberId: "c", netCents: 1000 },
      { memberId: "a", netCents: -1000 },
      { memberId: "b", netCents: 1000 },
      { memberId: "d", netCents: -1000 },
    ];
    const t1 = computeSettlement(nets);
    const t2 = computeSettlement([...nets].reverse());
    expect(t1).toEqual(t2);
  });

  it("produces minimal transfers for a clean 3-way split", () => {
    // a paid, b and c each owe a: a +2000, b -1000, c -1000 → 2 transfers
    const nets: MemberNet[] = [
      { memberId: "a", netCents: 2000 },
      { memberId: "b", netCents: -1000 },
      { memberId: "c", netCents: -1000 },
    ];
    expect(computeSettlement(nets)).toHaveLength(2);
  });
});
