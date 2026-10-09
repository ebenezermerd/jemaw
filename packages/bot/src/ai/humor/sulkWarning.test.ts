import { describe, it, expect } from "vitest";
import { sulkWarning } from "./deliver.js";

describe("sulkWarning", () => {
  const until = new Date("2026-10-09T16:59:00Z");

  it("names the one waiting expense, the end time and what still works", () => {
    const text = sulkWarning({
      pendingCount: 1,
      drafts: [{ label: "Pomi draft", amount: "1000.00", currency: "ETB" }],
      until,
    });
    expect(text).toContain("I'm going quiet until 7:59 PM (45 minutes).");
    expect(text).toContain("Approve or dismiss the waiting expense (Pomi draft · 1,000 ETB) in the app");
    expect(text).toContain("Money questions still get answered.");
  });

  it("counts several waiting expenses", () => {
    const text = sulkWarning({ pendingCount: 17, drafts: [{ label: "Groceries", amount: "200.00" }], until });
    expect(text).toContain("the 17 waiting expenses");
  });
});
