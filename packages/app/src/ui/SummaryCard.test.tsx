import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SummaryCard } from "./SummaryCard.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

const base: MeSummaryDto = {
  memberId: "m1",
  displayName: "Ebenezer",
  net: "24.00",
  totalPaid: "4360.00",
  totalShare: "9000.00",
  expenseCount: 4,
  currency: "ETB",
  owes: "312.00",
  owed: "336.00",
  owesTo: [{ memberId: "g", name: "Gemechis", amount: "312.00" }],
  owedBy: [{ memberId: "a", name: "Ayenew", amount: "336.00" }],
};

describe("SummaryCard", () => {
  it("leads with what you still have to pay, even when your net is positive", () => {
    const { container } = render(<SummaryCard s={base} />);
    const text = container.textContent!;
    expect(text).toContain("you owe");
    expect(text).toContain("312");
    expect(text).toContain("to Gemechis");
    expect(text).toContain("You're owed 336");
    expect(text).toContain("by Ayenew");
    expect(text).toContain("net +24");
    expect(text).not.toContain("you're owed");
  });

  it("shows what you're owed when you owe nothing", () => {
    const { container } = render(
      <SummaryCard s={{ ...base, net: "336.00", owes: "0.00", owesTo: [] }} />,
    );
    const text = container.textContent!;
    expect(text).toContain("you're owed");
    expect(text).toContain("+336");
    expect(text).toContain("from Ayenew");
  });

  it("names the count when several people are involved", () => {
    const { container } = render(
      <SummaryCard
        s={{
          ...base,
          owes: "400.00",
          owesTo: [
            { memberId: "g", name: "Gemechis", amount: "312.00" },
            { memberId: "t", name: "Getish", amount: "88.00" },
          ],
        }}
      />,
    );
    expect(container.textContent).toContain("to 2 people");
  });

  it("shows the even standing when nothing is open", () => {
    const { container } = render(
      <SummaryCard s={{ ...base, net: "0.00", owes: "0.00", owed: "0.00", owesTo: [], owedBy: [] }} />,
    );
    expect(container.textContent).toContain("all square");
  });

  it("labels the stats as lifetime totals", () => {
    const { container } = render(<SummaryCard s={base} />);
    expect(container.textContent).toContain("Lifetime paid");
    expect(container.textContent).toContain("Lifetime share");
    expect(container.textContent).toContain("Entries");
  });

  it("opens the settle plan when tapped", () => {
    const onOpen = vi.fn();
    const { getByRole } = render(<SummaryCard s={base} onOpen={onOpen} />);
    fireEvent.click(getByRole("button"));
    expect(onOpen).toHaveBeenCalled();
  });
});
