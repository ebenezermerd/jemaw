/**
 * Per-group scan rate limit: at most one scan per window per group. The
 * window can be a getter so the admin console can tune it at runtime.
 * In-memory map keyed by group id, fine for a single instance.
 */
export const SCAN_WINDOW_MS = 10_000;

export class ScanRateLimiter {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly windowMs: number | (() => number) = SCAN_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true if a scan is allowed now; records the time if so. */
  tryAcquire(groupId: string): boolean {
    const t = this.now();
    const prev = this.last.get(groupId);
    const windowMs = typeof this.windowMs === "function" ? this.windowMs() : this.windowMs;
    if (prev !== undefined && t - prev < windowMs) return false;
    this.last.set(groupId, t);
    return true;
  }
}
