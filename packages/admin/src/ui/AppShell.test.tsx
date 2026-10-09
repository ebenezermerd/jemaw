import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/api.js", () => ({ apiUrl: (p: string) => p, api: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("../lib/auth.js", () => ({
  useAuth: () => ({
    user: { email: "a@b.c", displayName: "Ada", photoURL: null, providerData: [], metadata: {} },
    logout: vi.fn(),
    sendPasswordReset: vi.fn(),
  }),
}));
const { AppShell } = await import("./AppShell.js");

function renderShell() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/groups"]}>
        <AppShell>
          <div>page</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

describe("AppShell sidebar", () => {
  it("lists every section with its label and a short description, grouped", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.textContent).toContain("Manage");
    expect(nav.textContent).toContain("System");
    expect(screen.getByRole("link", { name: /Groups\s*Group chats, access and AI/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Bot & Settings\s*Health, AI usage and switches/ })).toBeTruthy();
  });

  it("collapses to icons with tooltips, remembers it, and toggles with Ctrl+B", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    // The page header still says what Groups is; the sidebar no longer does.
    expect(screen.queryByText("Health, AI usage and switches")).toBeNull();
    const settings = screen.getByRole("link", { name: "Bot & Settings" });
    fireEvent.mouseEnter(settings);
    expect(screen.getByRole("tooltip").textContent).toContain("Health, AI usage and switches");
    expect(localStorage.getItem("jemaw-admin.sidebar-collapsed")).toBe("1");
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByText("Health, AI usage and switches")).toBeTruthy();
  });
});
