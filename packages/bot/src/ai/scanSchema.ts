/**
 * Strict schema for Gemini's JSON output (JEMAW_PLAN.md §6). Anything that
 * doesn't parse is dropped — never retried, never surfaced.
 */
import { z } from "zod";

export const suggestionSchema = z.object({
  kind: z.enum(["expense", "loan"]).optional().default("expense"),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().length(3),
  payer_telegram_id: z.number().int().nullable(),
  split_type: z.enum(["equal", "shares", "exact"]),
  // Empty when the chat names no participants — the scan then defaults the split
  // to the group's primary members rather than guessing a subset.
  split_with: z.array(z.number().int()),
  shares: z.record(z.string(), z.number().int().positive()).nullable(),
  // Drop any stray nulls the model occasionally emits in the id list.
  evidence_message_ids: z
    .array(z.number().int().nullable())
    .transform((ids) => ids.filter((id): id is number => id != null)),
  reasoning: z.string().max(200),
});

/** A settlement/payback mention ("I paid Sara back 200 for the cab"). */
export const settlementSuggestionSchema = z.object({
  confidence: z.number().min(0).max(1),
  from_telegram_id: z.number().int(),
  to_telegram_id: z.number().int(),
  amount: z.number().positive().nullable(),
  currency: z.string().length(3),
  evidence_message_ids: z
    .array(z.number().int().nullable())
    .transform((ids) => ids.filter((id): id is number => id != null)),
  reasoning: z.string().max(200),
});

/**
 * A tolerant array: validate each element independently and keep only the ones
 * that parse, instead of failing the whole array on a single bad item. This is
 * what stops one malformed settlement (e.g. a null member id Gemini emitted)
 * from discarding every valid expense in the same scan.
 */
function tolerantArray<T extends z.ZodTypeAny>(item: T) {
  return z
    .array(z.unknown())
    .optional()
    .default([])
    .transform((arr) =>
      arr
        .map((el) => item.safeParse(el))
        .filter((r): r is z.SafeParseSuccess<z.infer<T>> => r.success)
        .map((r) => r.data),
    );
}

export const scanResponseSchema = z.object({
  suggestions: tolerantArray(suggestionSchema),
  settlements: tolerantArray(settlementSuggestionSchema),
  // scan_window is advisory only (we derive the real window from msg ids in
  // code), so tolerate null / missing / partial rather than failing the scan.
  scan_window: z
    .object({
      from_message_id: z.number().int().nullable().optional(),
      to_message_id: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional()
    .default({}),
});

export type RawSettlement = z.infer<typeof settlementSuggestionSchema>;

export type RawSuggestion = z.infer<typeof suggestionSchema>;
export type ScanResponse = z.infer<typeof scanResponseSchema>;

/** Confidence thresholds (plan §6). */
export const CONFIDENCE_SURFACE = 0.7; // >= → normal card
export const CONFIDENCE_LOW = 0.5; // 0.5–0.7 → low-confidence card; < drop

export type SuggestionTier = "normal" | "low" | "drop";

export function tierFor(confidence: number): SuggestionTier {
  if (confidence >= CONFIDENCE_SURFACE) return "normal";
  if (confidence >= CONFIDENCE_LOW) return "low";
  return "drop";
}
