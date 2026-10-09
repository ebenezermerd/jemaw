import { describe, it, expect } from "vitest";
import { bossToneRule, endsPause, parseBossCommand } from "./boss.js";

describe("parseBossCommand", () => {
  it("reads the humor switches in their usual shapes", () => {
    expect(parseBossCommand("jemaw humor off")).toBe("humor_off");
    expect(parseBossCommand("@jemawsbot jokes on!")).toBe("humor_on");
    expect(parseBossCommand("jemaw turn off the jokes please")).toBe("humor_off");
    expect(parseBossCommand("Jemaw, switch your humor on")).toBe("humor_on");
  });

  it("ignores normal chat that only mentions humor", () => {
    expect(parseBossCommand("jemaw your humor is off today")).toBeNull();
    expect(parseBossCommand("jemaw how much do i owe")).toBeNull();
  });
});

describe("endsPause", () => {
  it("hears enough, come back and apologies", () => {
    expect(endsPause("jemaw enough")).toBe(true);
    expect(endsPause("Come on i apologize jemaw")).toBe(true);
    expect(endsPause("come back jemaw")).toBe(true);
    expect(endsPause("hey jemaw")).toBe(false);
  });
});

describe("bossToneRule", () => {
  it("forbids roasting in respect, softens in gentle, and adds nothing in normal", () => {
    expect(bossToneRule("respect", "Ebenezer")).toMatch(/never roast/);
    expect(bossToneRule("gentle")).toMatch(/lightly/);
    expect(bossToneRule("normal")).toBe("");
    expect(bossToneRule(undefined)).toBe("");
  });
});
