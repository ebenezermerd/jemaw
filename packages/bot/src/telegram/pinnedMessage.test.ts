import { describe, it, expect, vi } from "vitest";
import { buildOpenButton, ensurePinnedMessage } from "./pinnedMessage.js";

describe("buildOpenButton", () => {
  const base = {
    groupId: "abc-123",
    telegramChatId: 1n,
    existingPinnedMessageId: null,
    miniAppUrl: "https://jemaw-498106.web.app",
    botUsername: "jemawsbot",
    miniAppShortName: "app",
  };

  it("uses a t.me deep link with startapp when bot username + short name set", () => {
    const b = buildOpenButton(base, 0) as { text: string; url: string };
    expect(b.url).toBe(
      "https://t.me/jemawsbot/app?startapp=abc-123",
    );
  });

  it("labels the zero state with the open arrow", () => {
    const b = buildOpenButton(base, 0);
    expect(b.text).toBe("Open Jemaw ↗");
  });

  it("reflects the suggestion count in the label", () => {
    const b = buildOpenButton(base, 3);
    expect(b.text).toBe("Open Jemaw · 3 suggestions ↗");
  });

  it("uses the singular form for one suggestion", () => {
    const b = buildOpenButton(base, 1);
    expect(b.text).toBe("Open Jemaw · 1 suggestion ↗");
  });

  it("falls back to a plain url when deep-link config is missing", () => {
    const b = buildOpenButton(
      { ...base, botUsername: undefined, miniAppShortName: undefined },
      0,
    ) as { url: string };
    expect(b.url).toBe("https://jemaw-498106.web.app");
  });

  it("does not send a new message when creation is disabled", async () => {
    const api = {
      editMessageText: vi.fn(),
      sendMessage: vi.fn(),
      pinChatMessage: vi.fn(),
    };

    await ensurePinnedMessage(api as never, {} as never, base, 0, {
      createIfMissing: false,
    });

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.pinChatMessage).not.toHaveBeenCalled();
  });
});
