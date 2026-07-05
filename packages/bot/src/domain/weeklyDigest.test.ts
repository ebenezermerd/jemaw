import { describe, it, expect } from "vitest";
import {
  computeWeeklyKpis,
  formatWeeklyDigest,
  type WeeklyKpis,
} from "./weeklyDigest.js";

const since = new Date("2026-06-28T00:00:00Z");
const inWeek = new Date("2026-07-01T12:00:00Z");
const before = new Date("2026-06-20T12:00:00Z");

describe("computeWeeklyKpis", () => {
  it("counts only activity inside the window and finds the top payer", () => {
    const kpis = computeWeeklyKpis(
      [
        { payerMemberId: "a", amountCents: 200000, occurredAt: inWeek },
        { payerMemberId: "b", amountCents: 50000, occurredAt: inWeek },
        { payerMemberId: "a", amountCents: 999900, occurredAt: before },
      ],
      [
        { amountCents: 30000, when: inWeek },
        { amountCents: 70000, when: before },
      ],
      (id) => (id === "a" ? "Ebenezer" : "Tsin"),
      since,
    );
    expect(kpis.spentCents).toBe(250000);
    expect(kpis.expenseCount).toBe(2);
    expect(kpis.settledCents).toBe(30000);
    expect(kpis.settlementCount).toBe(1);
    expect(kpis.topPayerName).toBe("Ebenezer");
    expect(kpis.topPayerCents).toBe(200000);
  });

  it("handles an empty week", () => {
    const kpis = computeWeeklyKpis([], [], () => "x", since);
    expect(kpis.expenseCount).toBe(0);
    expect(kpis.topPayerName).toBeNull();
  });
});

describe("formatWeeklyDigest", () => {
  const kpis: WeeklyKpis = {
    spentCents: 420000,
    expenseCount: 12,
    settledCents: 190000,
    settlementCount: 3,
    topPayerName: "Ebenezer",
    topPayerCents: 210000,
  };

  it("renders kpi, standings, debts, and narrative sections with native boxes", () => {
    const msg = formatWeeklyDigest({
      groupName: "Trip",
      currency: "ETB",
      kpis,
      standings: [
        { name: "Ebenezer", netCents: 6119900 },
        { name: "Pomi", netCents: -5499300 },
        { name: "Even", netCents: 0 },
      ],
      openDebts: [
        { fromName: "Pomi", toName: "Ebenezer", amountCents: 5499300 },
      ],
      narrative: "Spending doubled this week. Pomi still carries most of the debt.",
    });
    expect(msg).toContain("Weekly summary");
    expect(msg).toContain("<blockquote>4,200.00 ETB spent · 12 expenses");
    expect(msg).toContain("1,900.00 ETB paid back · 3 settlements");
    expect(msg).toContain("Top payer: Ebenezer");
    // Standings render as an aligned monospace table.
    expect(msg).toContain("<pre>🟢 Ebenezer +61,199.00\n🔴 Pomi     −54,993.00</pre>");
    expect(msg).not.toContain("Even"); // zero nets dropped
    expect(msg).toContain("<blockquote>Pomi → Ebenezer · 54,993.00 ETB</blockquote>");
    expect(msg).toContain("<i>Spending doubled this week.");
  });

  it("collapses long debt lists behind an expandable blockquote", () => {
    const msg = formatWeeklyDigest({
      groupName: "Trip",
      currency: "ETB",
      kpis,
      standings: [],
      openDebts: [
        { fromName: "A", toName: "B", amountCents: 100 },
        { fromName: "C", toName: "D", amountCents: 100 },
        { fromName: "E", toName: "F", amountCents: 100 },
        { fromName: "G", toName: "H", amountCents: 100 },
      ],
      narrative: null,
    });
    expect(msg).toContain("<blockquote expandable>");
  });

  it("celebrates an all square group and omits a missing narrative", () => {
    const msg = formatWeeklyDigest({
      groupName: "Trip",
      currency: "ETB",
      kpis,
      standings: [],
      openDebts: [],
      narrative: null,
    });
    expect(msg).toContain("All square");
    expect(msg).not.toContain("<i>Spending");
  });
});
