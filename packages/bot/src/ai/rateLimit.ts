/**
 * Per-group scan rate limit (JEMAW_PLAN.md §10): at most one Gemini scan per
 * 60 seconds per group. In-memory map keyed by group id — good enough for a
 * single Cloud Run instance. `now`/`windowMs` are injectable for tests.
 */
export const SCAN_WINDOW_MS = 60_000;

export class ScanRateLimiter {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly windowMs = SCAN_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true if a scan is allowed now; records the time if so. */
  tryAcquire(groupId: string): boolean {
    const t = this.now();
    const prev = this.last.get(groupId);
    if (prev !== undefined && t - prev < this.windowMs) return false;
    this.last.set(groupId, t);
    return true;
  }
}
