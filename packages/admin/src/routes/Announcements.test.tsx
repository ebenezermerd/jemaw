import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_POST_DESIGNS } from "@jemaw/shared/posts";

const post = vi.fn(async (_p: string, body: unknown) => body);
vi.mock("../lib/api.js", () => ({
  apiUrl: (p: string) => p,
  api: {
    get: async (p: string) => {
      if (p === "/api/admin/bot/config") return { postDesigns: DEFAULT_POST_DESIGNS };
      if (p === "/api/admin/bot/status") return { configured: true, health: "ok" };
      return [];
    },
    blob: async () => new Blob(["png"]),
    post: (p: string, b: unknown) => post(p, b),
    delete: vi.fn(),
  },
}));

const { Announcements } = await import("./Announcements.js");

describe("Announcements", () => {
  it("writes a feature release with new and fixed items, previewed in its design", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Announcements />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Feature release/ }));
    fireEvent.change(screen.getByPlaceholderText(/Release title/), { target: { value: "Jemaw gets prettier" } });
    fireEvent.change(screen.getByLabelText("✨ New"), { target: { value: "Weekly pictures\nPayment checklists" } });
    fireEvent.change(screen.getByLabelText("🛠 Fixed"), { target: { value: "Removed members" } });

    const preview = await screen.findByTestId("post-preview");
    expect(within(preview).getByText("Jemaw gets prettier")).toBeTruthy();
    expect(within(preview).getByText("✨ New")).toBeTruthy();
    expect(within(preview).getByText("Payment checklists")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toMatchObject({
      kind: "release",
      title: "Jemaw gets prettier",
      release: { added: ["Weekly pictures", "Payment checklists"], improved: [], fixed: ["Removed members"] },
    });
  });
});
