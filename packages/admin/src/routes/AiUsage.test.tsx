import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { AdminAiUsageDto } from "@jemaw/shared/types";

const usage: AdminAiUsageDto = {
  today: { calls: 42, scans: 12, replies: 30, inputTokens: 51_000, outputTokens: 4_200, errors: 1 },
  days: Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(26 + i).padStart(2, "0")}`, scans: i, replies: i, tokens: i * 1000 })),
  byModel: [{ model: "openai/gpt-oss-120b", calls: 30, tokens: 40_000 }],
  groups: [
    { groupId: "g1", groupName: "Jemaw", access: "active", aiCallsToday: 9, aiDailyLimit: 10, mode: "roast", repliesToday: 46, maxPerDay: 50, mutedUntil: null },
    { groupId: "g2", groupName: "Quiet", access: "ai_paused", aiCallsToday: 0, aiDailyLimit: null, mode: "off", repliesToday: 0, maxPerDay: 0, mutedUntil: null },
  ],
  limits: {
    at: new Date().toISOString(),
    provider: "groq",
    model: "openai/gpt-oss-120b",
    source: "bot",
    requests: { limit: 1000, remaining: 812, resetSeconds: 300 },
    tokens: { limit: 8000, remaining: 950, resetSeconds: 20 },
  },
  canCheck: true,
  model: "openai/gpt-oss-120b",
};

const post = vi.fn(async (_p: string) => ({}));
vi.mock("../lib/api.js", () => ({
  apiUrl: (p: string) => `https://api.test${p}`, api: { get: async () => usage, post: (p: string) => post(p) } }));
const { AiUsageCard } = await import("./AiUsage.js");

describe("AiUsageCard", () => {
  it("shows what's left of Groq's limits, today's usage and each group's reply cap", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AiUsageCard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("812")).toBeTruthy();
    expect(screen.getByText("/ 1,000")).toBeTruthy();
    expect(screen.getByText("950")).toBeTruthy();
    expect(screen.getByText("AI calls today · 12 scans, 30 replies")).toBeTruthy();
    expect(screen.getByText("46 / 50")).toBeTruthy();
    expect(screen.getByText("humor off")).toBeTruthy();
    expect(screen.getByText("9 / 10 AI")).toBeTruthy();
    expect(screen.getByText("AI paused")).toBeTruthy();
    fireEvent.click(screen.getByText("Check now"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/ai/limits/check"));
  });
});
