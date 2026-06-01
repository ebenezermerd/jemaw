/**
 * Strict schema for Gemini's JSON output (JEMAW_PLAN.md §6). Anything that
 * doesn't parse is dropped — never retried, never surfaced.
 */
import { z } from "zod";

export const suggestionSchema = z.object({
  confidence: z.number().min(0).max(1),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().length(3),
  payer_telegram_id: z.number().int().nullable(),
  split_type: z.enum(["equal", "shares", "exact"]),
  split_with: z.array(z.number().int()).min(1),
  shares: z.record(z.string(), z.number().int().positive()).nullable(),
  evidence_message_ids: z.array(z.number().int()),
  reasoning: z.string().max(200),
});

export const scanResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
  scan_window: z.object({
    from_message_id: z.number().int(),
    to_message_id: z.number().int(),
  }),
});

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
