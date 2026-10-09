import { describe, it, expect } from "vitest";
import { ScanRateLimiter } from "./rateLimit.js";

describe("ScanRateLimiter", () => {
  it("allows the first scan and blocks a second within the window", () => {
    let t = 1_000_000;
    const rl = new ScanRateLimiter(60_000, () => t);
    expect(rl.tryAcquire("g1")).toBe(true);
    expect(rl.tryAcquire("g1")).toBe(false);
    t += 59_000;
    expect(rl.tryAcquire("g1")).toBe(false);
    t += 2_000; // now > 60s since first
    expect(rl.tryAcquire("g1")).toBe(true);
  });

  it("tracks groups independently", () => {
    const rl = new ScanRateLimiter(60_000, () => 0);
    expect(rl.tryAcquire("a")).toBe(true);
    expect(rl.tryAcquire("b")).toBe(true);
    expect(rl.tryAcquire("a")).toBe(false);
  });
});

describe("ScanRateLimiter with a tunable window", () => {
  it("reads the window on every call", () => {
    let windowMs = 10_000;
    let t = 0;
    const rl = new ScanRateLimiter(() => windowMs, () => t);
    expect(rl.tryAcquire("g")).toBe(true);
    t = 5_000;
    expect(rl.tryAcquire("g")).toBe(false);
    windowMs = 4_000;
    expect(rl.tryAcquire("g")).toBe(true);
  });
});
