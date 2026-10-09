import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("../lib/hooks.js", () => ({
  useGroup: () => ({
    data: {
      members: [
        { id: "m1", telegramUserId: "11", photoUrl: "/avatars/11.jpg?s=sig" },
        { id: "m2", telegramUserId: "-5", photoUrl: null },
      ],
    },
  }),
}));
vi.mock("../telegram.js", () => ({ currentTelegramId: () => "99", currentPhotoUrl: () => undefined }));
vi.mock("../lib/api.js", () => ({ apiUrl: (p: string) => `https://bot.test${p}` }));

const { MemberAvatar } = await import("./MemberAvatar.js");

describe("MemberAvatar", () => {
  it("shows another member's Telegram photo from the API", () => {
    const { container } = render(<MemberAvatar name="Hana" memberId="m1" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://bot.test/avatars/11.jpg?s=sig");
  });

  it("falls back to the initial for manual members and missing photos", () => {
    const manual = render(<MemberAvatar name="Sami" memberId="m2" />);
    expect(manual.container.querySelector("img")).toBeNull();
    expect(manual.container.textContent).toBe("S");
    const missing = render(<MemberAvatar name="Hana" telegramUserId="11" />);
    fireEvent.error(missing.container.querySelector("img")!);
    expect(missing.container.querySelector("img")).toBeNull();
    expect(missing.container.textContent).toBe("H");
  });
});
