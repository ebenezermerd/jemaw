import { describe, it, expect } from "vitest";
import {
  formatDisplayName,
  formatMemberChipLabel,
  firstDisplayName,
} from "./names.js";

describe("formatDisplayName", () => {
  it("capitalizes each word", () => {
    expect(formatDisplayName("ebenezer merdekios")).toBe("Ebenezer Merdekios");
    expect(formatDisplayName("mjdd")).toBe("Mjdd");
  });
});

describe("formatMemberChipLabel", () => {
  it("shortens first and last to initial", () => {
    expect(formatMemberChipLabel("Ebenezer Merdekios")).toBe("Ebenezer M..");
    expect(formatMemberChipLabel("Amanuel M")).toBe("Amanuel M..");
  });

  it("keeps single names", () => {
    expect(formatMemberChipLabel("mjdd")).toBe("Mjdd");
  });
});

describe("firstDisplayName", () => {
  it("returns first capitalized token", () => {
    expect(firstDisplayName("ebenezer merdekios")).toBe("Ebenezer");
  });
});
