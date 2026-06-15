import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SummaryCard } from "./SummaryCard.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

const base: MeSummaryDto = {
  memberId: "m1",
  displayName: "Sara",
  net: "48.50",
  totalPaid: "120.00",
  totalShare: "71.50",
  expenseCount: 4,
  currency: "EUR",
};

describe("SummaryCard", () => {
  it("renders the standing, cardholder and stats", () => {
    const { container } = render(<SummaryCard s={base} />);
    expect(container.textContent).toContain("you're owed");
    expect(container.textContent).toContain("Sara");
    expect(container.textContent).toContain("Paid");
    expect(container.textContent).toContain("Entries");
  });

  it("shows 'you owe' for a negative net", () => {
    const { container } = render(<SummaryCard s={{ ...base, net: "-18.00" }} />);
    expect(container.textContent).toContain("you owe");
  });

  it("shows the even standing at zero", () => {
    const { container } = render(<SummaryCard s={{ ...base, net: "0.00" }} />);
    expect(container.textContent).toContain("all square");
  });
});
