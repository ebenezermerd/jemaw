import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const members = [
  { id: "m1", displayName: "hana", isActive: true, isPrimary: true, telegramUserId: "1", role: "admin" },
  { id: "m2", displayName: "sami", isActive: false, isPrimary: false, telegramUserId: "2", role: "member" },
  { id: "m3", displayName: "abel", isActive: false, isPrimary: false, telegramUserId: "3", role: "member" },
];
const expense = {
  id: "e1",
  description: "Dinner",
  amount: "300.00",
  kind: "expense",
  payerMemberId: "m1",
  createdByMemberId: "m1",
  voidedAt: null,
  shares: [
    { memberId: "m1", shareAmount: "150.00" },
    { memberId: "m2", shareAmount: "150.00" },
  ],
};
vi.mock("../lib/hooks.js", () => ({
  useGroup: () => ({ data: { members, isAdmin: true, defaultCurrency: "ETB" }, isLoading: false }),
  useExpense: () => ({ data: expense, isLoading: false }),
  useEditExpense: () => ({ mutate: vi.fn(), isPending: false }),
  useVoidExpense: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../telegram.js", async (orig) => ({ ...(await orig<typeof import("../telegram.js")>()), currentTelegramId: () => "1" }));

const { ExpenseDetail } = await import("./ExpenseDetail.js");

describe("ExpenseDetail with a removed member", () => {
  it("still lists a removed member who shares the expense, and hides unrelated removed members", () => {
    render(
      <MemoryRouter initialEntries={["/expense/e1"]}>
        <Routes>
          <Route path="/expense/:id" element={<ExpenseDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Sami (removed)").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Abel/)).toBeNull();
  });
});
