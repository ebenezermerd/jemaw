import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  AdminExpenseDto,
  AdminExpensePageDto,
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminUserDetailDto,
  AdminUserDto,
} from "@jemaw/shared/types";

const get = vi.fn();
vi.mock("../lib/api.js", () => ({ api: { get: (p: string) => get(p), post: vi.fn() } }));

const { Groups } = await import("./Groups.js");
const { Expenses } = await import("./Expenses.js");
const { Users } = await import("./Users.js");

const group: AdminGroupDto = {
  id: "5c9c3dad-dee6-4c03-80e7-63d608dbe00c",
  name: "Jemaw",
  defaultCurrency: "ETB",
  memberCount: 2,
  volume: "68645.66",
  expenseCount: 59,
  createdAt: "2026-06-09T10:43:22.826Z",
};

const expense: AdminExpenseDto = {
  id: "e1",
  description: "Wed Lunch",
  amount: "780.00",
  currency: "ETB",
  kind: "expense",
  source: "manual",
  groupId: group.id,
  groupName: "Jemaw",
  payerMemberId: "m1",
  payerName: "Gemechis",
  occurredAt: "2026-10-08T09:00:00.000Z",
  voided: false,
  status: "open",
  shares: [
    { memberId: "m2", name: "Ayenew", amount: "390.00" },
    { memberId: "m1", name: "Gemechis", amount: "390.00" },
  ],
};

const detail: AdminGroupDetailDto = {
  group,
  members: [
    {
      memberId: "m1",
      displayName: "Gemechis",
      username: "Chisa_1959",
      telegramUserId: "1468513798",
      isManual: false,
      role: "admin",
      isActive: true,
      isPrimary: true,
      paid: "43140.66",
      share: "17016.17",
      net: "2946.66",
      expenseCount: 35,
    },
    {
      memberId: "m2",
      displayName: "Ayenew",
      username: null,
      telegramUserId: "-814490836",
      isManual: true,
      role: "member",
      isActive: true,
      isPrimary: true,
      paid: "3770.00",
      share: "16859.49",
      net: "-1971.66",
      expenseCount: 4,
    },
  ],
  transfers: [{ fromMemberId: "m2", fromName: "Ayenew", toMemberId: "m1", toName: "Gemechis", amount: "1388.00" }],
  settlements: [],
  stats: { spend: "68645.66", loans: "1.67", settled: "33280.16", openExpenses: 17, settledExpenses: 42 },
};

const page: AdminExpensePageDto = { items: [expense], total: 61 };

const user: AdminUserDto = {
  telegramUserId: "1468513798",
  displayName: "Gemechis",
  username: "Chisa_1959",
  groupCount: 1,
  isActive: true,
  lastActiveAt: "2026-10-08T14:48:23.126Z",
  status: "active",
  isManual: false,
};

const userDetail: AdminUserDetailDto = {
  user,
  memberships: [
    {
      groupId: group.id,
      groupName: "Jemaw",
      currency: "ETB",
      memberId: "m1",
      displayName: "Gemechis",
      role: "admin",
      isActive: true,
      isPrimary: true,
      paid: "43140.66",
      net: "2946.66",
      expenseCount: 35,
    },
  ],
  recentExpenses: [expense],
};

function routeGet(path: string): unknown {
  if (path === "/api/admin/groups") return [group];
  if (path.startsWith("/api/admin/groups/")) return detail;
  if (path.startsWith("/api/admin/expenses")) return page;
  if (path === "/api/admin/users") return [user];
  if (path.startsWith("/api/admin/users/")) return userDetail;
  throw new Error(`unexpected ${path}`);
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (p: string) => routeGet(p));
});

describe("Groups", () => {
  it("shows real counts on the card and real members, roles and balances in the detail", async () => {
    wrap(<Groups />);
    fireEvent.click(await screen.findByText("Jemaw"));
    expect(await screen.findByText("+2,946.66 ETB")).toBeTruthy();
    expect(screen.getByText("−1,971.66 ETB")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("added by hand")).toBeTruthy();
    expect(screen.getByText("1,388 ETB")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(`/api/admin/groups/${group.id}`);
  });
});

describe("Expenses", () => {
  it("lists the server page with its true total and shows the real split", async () => {
    wrap(<Expenses />);
    expect(await screen.findByText("1–1 of 61")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    fireEvent.click(screen.getByText("Wed Lunch"));
    expect(await screen.findByText("Equal · 2 people")).toBeTruthy();
    expect(screen.getByText("owes Gemechis for this")).toBeTruthy();
    expect(screen.queryByText(/Member 2/)).toBeNull();
  });
});

describe("Users", () => {
  it("shows memberships with net balances from the user endpoint", async () => {
    wrap(<Users />);
    fireEvent.click(await screen.findByText("Gemechis"));
    await waitFor(() => expect(screen.getAllByText("+2,946.66 ETB").length).toBeGreaterThan(0));
    expect(screen.getByText("43,140.66 ETB")).toBeTruthy();
  });
});
