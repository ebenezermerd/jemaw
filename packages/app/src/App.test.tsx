import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { Money } from "./ui/primitives.js";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

describe("App", () => {
  it("shows the splash with guidance when opened without a group context", () => {
    // No ?group= and no Telegram start_param → no group → splash.
    render(wrap(<App />));
    expect(screen.getByText(/open from your group/i)).toBeDefined();
    expect(
      screen.getByText(/Tap the pinned .* button in your group chat/i),
    ).toBeDefined();
  });
});

describe("Money", () => {
  it("renders signed positive amounts with a + and currency symbol", () => {
    const { container } = render(<Money value="12.50" currency="EUR" signed />);
    expect(container.textContent).toContain("€");
    expect(container.textContent).toContain("+12.50");
  });
});
