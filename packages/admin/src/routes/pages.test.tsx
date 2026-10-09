import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type {
  AdminActivityPageDto,
  AdminExpenseDto,
  AdminExpensePageDto,
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminUserDetailDto,
  AdminUserDto,
} from "@jemaw/shared/types";

const get = vi.fn();
vi.mock("../lib/api.js", () => ({
  apiUrl: (p: string) => `https://api.test${p}`,
  api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { Groups, GroupDetailPage } = await import("./Groups.js");
const { Expenses } = await import("./Expenses.js");
const { Users, UserDetailPage } = await import("./Users.js");
const { Logs } = await import("./Logs.js");

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
  settings: {
    humor: {
      mode: "roast",
      publicRepliesEnabled: true,
      maxPublicRepliesPerDay: 50,
      cooldownMinutes: 0,
      languageMode: "auto",
      useModelComposer: true,
      useGroupVibe: true,
      usePreferenceLearning: true,
      ledgerBanter: true,
      callbacks: "off",
      publicFinancialRoasting: false,
      hardshipHumor: false,
      latePaymentHumor: true,
      relationshipConflictHumor: false,
      profanity: "off",
      memberTargeting: "group_only",
      mutedUntil: null,
    },
    currencyLocked: true,
    telegramChatId: "-1003",
    access: { status: "active", until: null, reason: null, aiDailyLimit: 30, aiCallsToday: 12 },
  },
  members: [
    {
      memberId: "m1",
      photoUrl: "/avatars/1468513798.jpg?s=sig",
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
      photoUrl: null,
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
  photoUrl: "/avatars/1468513798.jpg?s=sig",
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

const activity: AdminActivityPageDto = {
  total: 1,
  items: [
    {
      id: "r1",
      source: "reply",
      severity: "warn",
      groupId: group.id,
      groupName: "Jemaw",
      actor: "Jemaw",
      action: "reply.suppressed",
      summary: "Stayed quiet: cooldown",
      detail: { reason: "cooldown" },
      at: "2026-10-08T10:00:00.000Z",
    },
  ],
};

function routeGet(path: string): unknown {
  if (path.startsWith("/api/admin/activity")) return activity;
  if (path === "/api/admin/groups") return [group];
  if (path.startsWith("/api/admin/groups/")) return detail;
  if (path.startsWith("/api/admin/expenses")) return page;
  if (path === "/api/admin/users") return [user];
  if (path.startsWith("/api/admin/users/")) return userDetail;
  throw new Error(`unexpected ${path}`);
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function wrap(node: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:telegramId" element={<UserDetailPage />} />
          <Route path="*" element={node} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (p: string) => routeGet(p));
});

describe("Groups", () => {
  it("opens a group at its own URL with real members, roles, balances and management", async () => {
    wrap(null, "/groups");
    fireEvent.click(await screen.findByText("Jemaw"));
    expect(screen.getByTestId("where").textContent).toBe(`/groups/${group.id}`);
    expect(await screen.findByText("+2,946.66 ETB")).toBeTruthy();
    expect(screen.getByText("−1,971.66 ETB")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("added by hand")).toBeTruthy();
    expect(screen.getByText("1,388 ETB")).toBeTruthy();
    expect(screen.getByText("Edit group")).toBeTruthy();
    expect(screen.queryByText("Delete group")).toBeNull();
    expect(screen.getByText("Clear expenses", { selector: "button" })).toBeTruthy();
    expect(screen.getByText("12 AI calls today of 30")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Suspended/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Brag & roast with real numbers" }).getAttribute("aria-checked")).toBe("true");
    expect(get).toHaveBeenCalledWith(`/api/admin/groups/${group.id}`);
    // Real Telegram members get their profile photo; manual ones keep the letter.
    const photos = within(screen.getByTestId("group-members")).getAllByRole("presentation");
    expect(photos).toHaveLength(1);
    expect(photos[0]!.getAttribute("src")).toContain("/avatars/1468513798.jpg?s=sig");
  });

  it("opens a member's profile and comes back to the group, not the user list", async () => {
    wrap(null, `/groups/${group.id}`);
    const list = await screen.findByTestId("group-members");
    fireEvent.click(within(list).getByText("Gemechis"));
    expect(screen.getByTestId("where").textContent).toBe("/users/1468513798");
    const back = await screen.findByRole("button", { name: "Jemaw" });
    fireEvent.click(back);
    expect(screen.getByTestId("where").textContent).toBe(`/groups/${group.id}`);
  });

  it("shows skeletons while the group loads", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    wrap(null, `/groups/${group.id}`);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
});

describe("Expenses", () => {
  it("puts the range and a 30-row page size in the footer and shows the real split", async () => {
    wrap(<Expenses />, "/expenses");
    expect(await screen.findByText("1–30 of 61")).toBeTruthy();
    expect((screen.getByLabelText("Rows per page") as HTMLSelectElement).value).toBe("30");
    expect(get).toHaveBeenCalledWith(expect.stringContaining("limit=30&offset=0"));
    expect(screen.getByText("Open")).toBeTruthy();
    fireEvent.click(screen.getByText("Wed Lunch"));
    expect(await screen.findByText("Equal · 2 people")).toBeTruthy();
    expect(screen.getByText("owes Gemechis for this")).toBeTruthy();
    expect(screen.queryByText(/Member 2/)).toBeNull();
  });

  it("asks for the next page with the chosen page size", async () => {
    wrap(<Expenses />, "/expenses");
    await screen.findByText("1–30 of 61");
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "10" } });
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("limit=10&offset=0")));
    fireEvent.click(await screen.findByText("Next"));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("limit=10&offset=10")));
  });
});

describe("Users", () => {
  it("shows memberships with net balances and a capitalized name", async () => {
    get.mockImplementation(async (p: string) =>
      p.startsWith("/api/admin/users/") ? { ...userDetail, user: { ...user, displayName: "gemechis tola" } } : routeGet(p),
    );
    wrap(null, "/users");
    fireEvent.click(await screen.findByText("Gemechis"));
    expect(await screen.findByRole("heading", { name: "Gemechis Tola" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("+2,946.66 ETB").length).toBeGreaterThan(0));
    expect(screen.getByText("43,140.66 ETB")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All users" })).toBeTruthy();
  });
});

describe("Logs", () => {
  it("lists bot activity and filters by source on the server", async () => {
    wrap(<Logs />, "/logs");
    expect(await screen.findByText("Stayed quiet: cooldown")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "AI scans" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("source=scan")));
  });
});
