import { describe, it, expect } from "vitest";
import { toMemberDto, toGroupDto } from "./mappers.js";
import type { Member, Group } from "@jemaw/shared/schema";

function member(over: Partial<Member> = {}): Member {
  return {
    id: "m1",
    groupId: "g1",
    telegramUserId: 111n,
    displayName: "Abe",
    username: null,
    role: "member",
    isActive: true,
    joinedAt: new Date(),
    ...over,
  } as Member;
}

const group: Group = {
  id: "g1",
  telegramChatId: 1n,
  name: "Trip",
  defaultCurrency: "ETB",
  pinnedMessageId: null,
  lastScanMessageId: null,
  createdAt: new Date(),
} as Group;

describe("toMemberDto", () => {
  it("exposes the member role", () => {
    expect(toMemberDto(member({ role: "admin" })).role).toBe("admin");
    expect(toMemberDto(member({ role: "member" })).role).toBe("member");
  });
});

describe("toGroupDto isAdmin", () => {
  it("is true when the caller is an admin", () => {
    const caller = member({ id: "m1", role: "admin" });
    const dto = toGroupDto(group, [caller], false, false, caller);
    expect(dto.isAdmin).toBe(true);
  });

  it("is false when the caller is a plain member", () => {
    const caller = member({ id: "m1", role: "member" });
    const dto = toGroupDto(group, [caller], false, false, caller);
    expect(dto.isAdmin).toBe(false);
  });
});
