import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_BOSS_CONFIG } from "@jemaw/shared/boss";

let role: "super" | "admin" = "super";
const patch = vi.fn(async (_path: string, body: { boss: unknown }) => ({ boss: body.boss }));
vi.mock("../lib/api.js", () => ({
  apiUrl: (p: string) => p,
  api: {
    get: async (p: string) => {
      if (p === "/api/admin/me") return { uid: "u", email: "me@jemaw.test", role };
      if (p === "/api/admin/bot/config") return { boss: DEFAULT_BOSS_CONFIG };
      if (p === "/api/admin/users") {
        return [
          { telegramUserId: "111", displayName: "Ebenezer Merdekios", username: "ebenezer", isManual: false },
          { telegramUserId: "222", displayName: "Amanuel M", username: null, isManual: false },
        ];
      }
      return {};
    },
    patch: (p: string, b: { boss: unknown }) => patch(p, b),
  },
}));

const { BossModeCard } = await import("./BossMode.js");

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BossModeCard />
    </QueryClientProvider>,
  );
}

describe("Super admin in the bot", () => {
  beforeEach(() => {
    patch.mockClear();
    role = "super";
  });

  it("links a Telegram account found by @username", async () => {
    renderCard();
    expect(await screen.findByText(/None linked yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find a Telegram account"), { target: { value: "@eben" } });
    fireEvent.click(await screen.findByRole("button", { name: "Make super admin" }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]![1].boss).toMatchObject({
      people: [{ telegramUserId: "111", name: "Ebenezer Merdekios" }],
      tone: "respect",
    });
  });

  it("is read only for console admins who aren't super", async () => {
    role = "admin";
    renderCard();
    expect(await screen.findByText(/Only super admins can change this/)).toBeTruthy();
    expect(screen.queryByLabelText("Find a Telegram account")).toBeNull();
    expect(((await screen.findByRole("switch", { name: "Chat commands" })) as HTMLButtonElement).disabled).toBe(true);
  });
});
