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
export type ExpenseKind = "expense" | "loan";

export interface MemberDto {
  id: string;
  displayName: string;
  username: string | null;
  telegramUserId: TelegramIdString;
  role: "admin" | "member";
  isActive: boolean;
}

export interface GroupDto {
  id: string;
  name: string;
  defaultCurrency: string;
  members: MemberDto[];
  hasExpenses: boolean;
  /** True when new chat messages arrived since the last AI scan. */
  canScan: boolean;
  /** Whether the calling member is an admin of this group. */
  isAdmin: boolean;
}

export interface ExpenseShareDto {
  memberId: string;
  /** decimal string */
  shareAmount: string;
}

export interface ExpenseDto {
  id: string;
  kind: ExpenseKind;
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

/** The calling member's personal standing for the Home summary card. */
export interface MeSummaryDto {
  memberId: string;
  displayName: string;
  /** signed decimal — focal number */
  net: string;
  /** sum of expenses this member fronted (decimal) */
  totalPaid: string;
  /** sum of this member's shares (decimal) */
  totalShare: string;
  /** number of live expense or loan entries they're involved in */
  expenseCount: number;
  currency: string;
}

export interface UpdateGroupInput {
  defaultCurrency?: string;
}

// ─── Request bodies ───────────────────────────────────────────────────
export interface CreateExpenseInput {
  kind?: ExpenseKind;
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

// ─── Settlements ──────────────────────────────────────────────────────
/** A single transfer in a live settle-up plan (not yet persisted). */
export interface TransferDto {
  fromMemberId: string;
  toMemberId: string;
  /** decimal string */
  amount: string;
}

export interface SettlePlanResponse {
  transfers: TransferDto[];
}

export type PaymentMethod = "cash" | "bank" | "telebirr" | "other";

/** A persisted, paid settlement. */
export interface SettlementDto {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  /** decimal string */
  amount: string;
  currency: string;
  method: PaymentMethod;
  description: string | null;
  expenseIds: string[] | null;
  occurredAt: string | null; // ISO
  markedPaidAt: string | null; // ISO
  markedPaidByMemberId: string | null;
  createdAt: string; // ISO
}

export interface CreateSettlementInput {
  toMemberId: string;
  fromMemberId?: string;
  /** Omit to auto-fill the full owed amount across the selected expenses. */
  amount?: string;
  method?: PaymentMethod;
  description?: string;
  /** At least one expense must be selected; amount must not exceed what is owed. */
  expenseIds: string[];
  occurredAt?: string;
}

// ─── Suggestions (Phase 3) ────────────────────────────────────────────
export type SuggestionKind = "expense" | "loan" | "settlement";

export interface SuggestionDto {
  id: string;
  kind: SuggestionKind;
  /** decimal string; may be null for a vague settlement until edited */
  amount: string | null;
  description: string;
  /** expense: who paid */
  payerMemberId: string | null;
  /** settlement: payer → payee */
  fromMemberId: string | null;
  toMemberId: string | null;
  splitType: SplitType;
  /** member ids (expense only) */
  splitWith: string[];
  shares: Record<string, number> | null;
  /** expense ids this settlement suggestion covers (AI-matched, may be empty) */
  expenseIds: string[];
  /** telegram message ids cited as evidence */
  evidenceMessageIds: number[];
  reasoning: string;
  /** 0..1, two decimals */
  confidence: string;
  /** "normal" | "low" — derived from confidence for the UI strip */
  tier: "normal" | "low";
}

export interface SuggestionsResponse {
  suggestions: SuggestionDto[];
  /** true while a scan is in flight (the UI polls). */
  scanning: boolean;
}

/** Body for confirming a suggestion — amount required for vague settlements. */
export interface ConfirmSuggestionInput {
  amount?: string;
}

// ─── History ──────────────────────────────────────────────────────────
export type HistoryItem =
  | { kind: "expense"; expense: ExpenseDto; settled: boolean }
  | { kind: "settlement"; settlement: SettlementDto; settled: boolean };

export interface HistoryDayGroup {
  /** YYYY-MM-DD */
  date: string;
  /** expenses + settlements for the day, newest first */
  items: HistoryItem[];
}

export interface HistoryResponse {
  days: HistoryDayGroup[];
}
