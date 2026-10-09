import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_POST_DESIGNS } from "@jemaw/shared/posts";

const patch = vi.fn(async (_path: string, body: { postDesigns: unknown }) => ({ postDesigns: body.postDesigns }));
const post = vi.fn(async (_p: string, _b?: unknown) => ({ ok: true, mode: "rich", sent: 3, failed: 0, skipped: 1, errors: [] }));
vi.mock("../lib/api.js", () => ({
  apiUrl: (p: string) => p,
  api: {
    get: async (p: string) => {
      if (p === "/api/admin/bot/config") return { postDesigns: DEFAULT_POST_DESIGNS };
      if (p === "/api/admin/groups") return [{ id: "g1", name: "jemaw" }];
      return {};
    },
    blob: async () => new Blob(["png"]),
    patch: (p: string, b: { postDesigns: unknown }) => patch(p, b),
    post: (p: string, b: unknown) => post(p, b),
  },
}));
globalThis.URL.createObjectURL = () => "blob:img";

const { Designs } = await import("./Designs.js");

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Designs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Message designs", () => {
  it("previews the weekly report and follows each toggle", async () => {
    renderPage();
    const preview = await screen.findByTestId("post-preview");
    expect(within(preview).getByText("Weekly report")).toBeTruthy();
    expect(within(preview).getByText("Open Jemaw")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Slideshow" }));
    expect(within(preview).getByLabelText("Slideshow")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Classic/ }));
    expect(screen.getByText("Classic message")).toBeTruthy();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("shows payments as a checklist or a headerless table", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "AI: my payments" }));
    const preview = screen.getByTestId("post-preview");
    expect(within(preview).getAllByLabelText("unchecked")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "Table, no header" }));
    expect(within(preview).queryAllByLabelText("unchecked")).toHaveLength(0);
    expect(preview.querySelector("th")).toBeNull();
    expect(preview.querySelectorAll("tr")).toHaveLength(2);
  });

  it("saves every design in one go", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Feature releases" }));
    fireEvent.change(screen.getByPlaceholderText("None"), { target: { value: "See you next week" } });
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const body = patch.mock.calls[0]![1] as { postDesigns: typeof DEFAULT_POST_DESIGNS };
    expect(body.postDesigns.release.footer).toBe("See you next week");
    expect(body.postDesigns.weekly).toEqual(DEFAULT_POST_DESIGNS.weekly);
  });

  it("sends the weekly report to every group after a confirmation", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: "All groups" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to all 1 group" }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, send" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/designs/send", expect.objectContaining({ useCase: "weekly", target: "all" })));
    expect(await screen.findByText(/Sent to 3 groups · 1 skipped/)).toBeTruthy();
  });
});
