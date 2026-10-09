import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiAccessNotice, SuspendedScreen } from "./GroupAccess.js";

const base = { status: "active" as const, until: null, reason: null, aiDailyLimit: null, aiCallsToday: 0 };

describe("SuspendedScreen", () => {
  it("shows the Jemaw branding with the reason and when it comes back", () => {
    render(<SuspendedScreen groupName="Jemaw" access={{ ...base, status: "suspended", reason: "Back after maintenance" }} />);
    expect(screen.getByText("paused by the Jemaw team")).toBeTruthy();
    expect(screen.getByText("Jemaw is on pause")).toBeTruthy();
    expect(screen.getByText("Back after maintenance")).toBeTruthy();
    expect(screen.getByText("Back when the Jemaw team lifts it")).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });
});

describe("AiAccessNotice", () => {
  it("stays hidden when the group is fine", () => {
    const { container } = render(<AiAccessNotice access={{ ...base, aiDailyLimit: 10, aiCallsToday: 3 }} />);
    expect(container.textContent).toBe("");
  });

  it("explains a pause and a used-up daily allowance", () => {
    const { rerender } = render(<AiAccessNotice access={{ ...base, status: "ai_paused" }} />);
    expect(screen.getByRole("status").textContent).toContain("AI is paused for this group");
    rerender(<AiAccessNotice access={{ ...base, aiDailyLimit: 10, aiCallsToday: 10 }} />);
    expect(screen.getByRole("status").textContent).toContain("today's AI allowance");
  });
});
