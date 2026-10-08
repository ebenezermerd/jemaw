import { describe, it, expect } from "vitest";
import { deriveUserStatus, toUserDto } from "./mappers.js";
import type { AdminUserRow } from "./repo.js";

const NOW = Date.parse("2026-06-24T00:00:00Z");

function row(over: Partial<AdminUserRow>): AdminUserRow {
  return {
    telegramUserId: 123n,
    displayName: "Test",
    username: "test",
    groupCount: 2,
    isActive: true,
    lastActiveAt: null,
    joinedAt: new Date(NOW - 60 * 24 * 60 * 60 * 1000),
    ...over,
  };
}

describe("deriveUserStatus", () => {
  it("suspended when inactive regardless of activity", () => {
    expect(deriveUserStatus(row({ isActive: false, lastActiveAt: new Date(NOW) }), NOW)).toBe(
      "suspended",
    );
  });

  it("new when they joined lately and have no activity yet", () => {
    expect(deriveUserStatus(row({ lastActiveAt: null, joinedAt: new Date(NOW - 86_400_000) }), NOW)).toBe("new");
  });

  it("idle, not new, when they joined long ago and never did anything", () => {
    expect(deriveUserStatus(row({ lastActiveAt: null }), NOW)).toBe("idle");
  });

  it("active when recently active", () => {
    const recent = new Date(NOW - 2 * 24 * 60 * 60 * 1000);
    expect(deriveUserStatus(row({ lastActiveAt: recent }), NOW)).toBe("active");
  });

  it("idle when last active beyond the idle window", () => {
    const old = new Date(NOW - 40 * 24 * 60 * 60 * 1000);
    expect(deriveUserStatus(row({ lastActiveAt: old }), NOW)).toBe("idle");
  });
});

describe("toUserDto", () => {
  it("serializes telegram id as a string and dates as ISO", () => {
    const dto = toUserDto(row({ telegramUserId: 99999999999n, lastActiveAt: new Date(NOW) }), NOW);
    expect(dto.telegramUserId).toBe("99999999999");
    expect(dto.lastActiveAt).toBe(new Date(NOW).toISOString());
    expect(dto.status).toBe("active");
    expect(dto.isManual).toBe(false);
  });

  it("flags manual members, who have negative synthetic ids", () => {
    expect(toUserDto(row({ telegramUserId: -814490836n }), NOW).isManual).toBe(true);
  });
});
