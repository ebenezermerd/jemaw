import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../lib/api.js", () => ({
  api: { get: (p: string) => get(p), put: (p: string, b: unknown) => put(p, b), delete: (p: string) => del(p), post: vi.fn(), patch: vi.fn() },
}));
const logout = vi.fn(async () => {});
const sendPasswordReset = vi.fn(async () => {});
vi.mock("../lib/auth.js", () => ({
  useAuth: () => ({
    user: {
      email: "ebenezermerd@gmail.com",
      displayName: "Ebenezer Merd",
      photoURL: null,
      providerData: [{ providerId: "password" }],
      metadata: { lastSignInTime: "Thu, 08 Oct 2026 17:00:00 GMT" },
    },
    logout,
    sendPasswordReset,
  }),
}));

const { AccountMenu } = await import("./AccountMenu.js");

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<AccountMenu />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const admins = {
  canManage: true,
  admins: [
    { email: "ebenezermerd@gmail.com", role: "super" },
    { email: "gemeelijah@gmail.com", role: "super" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (p: string) =>
    p === "/api/admin/me" ? { uid: "u", email: "ebenezermerd@gmail.com", role: "super" } : admins,
  );
});

describe("AccountMenu", () => {
  it("shows the real role and opens a menu that navigates, resets the password and signs out", async () => {
    wrap();
    expect(await screen.findByText("Super admin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("ebenezermerd@gmail.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Send password reset email/ }));
    expect(await screen.findByText("Reset link sent to ebenezermerd@gmail.com.")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Bot & settings/ }));
    expect(screen.getByTestId("where").textContent).toBe("/settings");
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it("lets a super admin add and remove console admins but not themselves", async () => {
    put.mockResolvedValue({ ...admins, admins: [...admins.admins, { email: "new@x.com", role: "admin" }] });
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Console admins/ }));
    expect(await screen.findByText("gemeelijah@gmail.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove ebenezermerd@gmail.com" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "new@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/admin/admins", { email: "new@x.com", role: "admin" }));
    expect(await screen.findByText("new@x.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove gemeelijah@gmail.com" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/admin/admins/gemeelijah%40gmail.com"));
  });
});
