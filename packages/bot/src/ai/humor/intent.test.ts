import { describe, it, expect } from "vitest";
import {
  classifyJemawIntent,
  sanitizeAddressedUtterance,
  stripJemawToken,
} from "./intent.js";

describe("classifyJemawIntent", () => {
  it("treats bare jemaw as scan", () => {
    expect(classifyJemawIntent("jemaw")).toBe("scan");
    expect(classifyJemawIntent("Jemaw!")).toBe("scan");
    expect(classifyJemawIntent("  jemaw  ")).toBe("scan");
  });

  it("routes social banter to chat", () => {
    expect(classifyJemawIntent("hey jemaw what's up?")).toBe("chat");
    expect(classifyJemawIntent("you cooking something jemaw?")).toBe("chat");
    expect(classifyJemawIntent("jemaw how are you")).toBe("chat");
    expect(classifyJemawIntent("yo jemaw")).toBe("chat");
    expect(classifyJemawIntent("jemaw you good?")).toBe("chat");
  });

  it("routes ledger asks to scan", () => {
    expect(classifyJemawIntent("jemaw check pending")).toBe("scan");
    expect(classifyJemawIntent("jemaw we spent on lunch")).toBe("scan");
    expect(classifyJemawIntent("jemaw any new expenses?")).toBe("scan");
    expect(classifyJemawIntent("jemaw scan please")).toBe("scan");
  });
});

describe("stripJemawToken", () => {
  it("removes the keyword", () => {
    expect(stripJemawToken("hey jemaw what's up?")).toBe("hey what's up?");
  });
});

describe("sanitizeAddressedUtterance", () => {
  it("bounds length and strips urls", () => {
    const s = sanitizeAddressedUtterance(
      "hey jemaw see https://evil.example/x " + "a".repeat(200),
      80,
    );
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s).not.toMatch(/https?:/);
  });
});
