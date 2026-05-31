/**
 * Shared API contract types — the wire format between @jemaw/bot and
 * @jemaw/app.
 *
 * Conventions:
 * - Telegram IDs (bigint in the DB) cross the wire as STRINGS.
 * - Money crosses as a decimal STRING ("12.50"), matching numeric(12,2).
 *   Internally the bot computes in integer cents; it serializes to a string
 *   at the API boundary.
 */

// ─── Health ───────────────────────────────────────────────────────────
export interface HealthResponse {
  ok: true;
  service: "jemaw-bot";
}

// ─── Telegram ID helpers ──────────────────────────────────────────────
export type TelegramIdString = string;

export function telegramIdToString(id: bigint): TelegramIdString {
  return id.toString();
}

export function telegramIdFromString(s: TelegramIdString): bigint {
  return BigInt(s);
}

// ─── Money helpers (decimal string <-> integer cents) ─────────────────
/** "12.50" -> 1250. Throws on malformed input. */
export function decimalToCents(decimal: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!m) throw new Error(`Invalid money string: ${decimal}`);
  const sign = m[1] === "-" ? -1 : 1;
  const whole = Number(m[2]);
  const frac = (m[3] ?? "").padEnd(2, "0");
  return sign * (whole * 100 + Number(frac));
}

/** 1250 -> "12.50". */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

// ─── Domain DTOs ──────────────────────────────────────────────────────
export type SplitType = "equal" | "shares" | "exact";

export interface MemberDto {
  id: string;
  displayName: string;
  username: string | null;
  telegramUserId: TelegramIdString;
  isActive: boolean;
}

export interface GroupDto {
  id: string;
  name: string;
  defaultCurrency: string;
  members: MemberDto[];
  hasExpenses: boolean;
}

export interface ExpenseShareDto {
  memberId: string;
  /** decimal string */
  shareAmount: string;
}

export interface ExpenseDto {
  id: string;
  description: string;
  /** decimal string */
  amount: string;
  currency: string;
  payerMemberId: string;
  createdByMemberId: string;
  source: "manual" | "ai_confirmed" | "ai_edited";
  occurredAt: string; // ISO
  createdAt: string; // ISO
  voidedAt: string | null;
  shares: ExpenseShareDto[];
}

export interface BalanceDto {
  memberId: string;
  displayName: string;
  /** signed decimal string; positive = owed, negative = owes */
  net: string;
}

// ─── Request bodies ───────────────────────────────────────────────────
export interface CreateExpenseInput {
  description: string;
  /** decimal string */
  amount: string;
  payerMemberId: string;
  splitType: SplitType;
  /** member ids participating in the split */
  splitWith: string[];
  /** required when splitType === "shares": memberId -> integer share count */
  shares?: Record<string, number>;
  /** required when splitType === "exact": memberId -> decimal string */
  exact?: Record<string, string>;
  /** ISO; defaults to now if omitted */
  occurredAt?: string;
}

export interface AddMemberInput {
  displayName: string;
  telegramUserId?: TelegramIdString;
}

export interface RenameMemberInput {
  displayName: string;
}

// ─── History ──────────────────────────────────────────────────────────
export interface HistoryDayGroup {
  /** YYYY-MM-DD */
  date: string;
  expenses: ExpenseDto[];
}

export interface HistoryResponse {
  days: HistoryDayGroup[];
}
