import { describe, it, expect } from "vitest";
import { scanResponseSchema, tierFor } from "./scanSchema.js";

const valid = {
  suggestions: [
    {
      confidence: 0.82,
      description: "Dinner at Trattoria",
      amount: 52.0,
      currency: "EUR",
      payer_telegram_id: 123,
      split_type: "equal",
      split_with: [123, 456],
      shares: null,
      evidence_message_ids: [101, 103],
      reasoning: "Sara said she got dinner ~50",
    },
  ],
  scan_window: { from_message_id: 99, to_message_id: 150 },
};

describe("scanResponseSchema", () => {
  it("parses a valid Gemini response", () => {
    const r = scanResponseSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("accepts a null payer (model unsure)", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [{ ...valid.suggestions[0], payer_telegram_id: null }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects confidence out of range", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [{ ...valid.suggestions[0], confidence: 1.5 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [{ ...valid.suggestions[0], amount: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing scan_window", () => {
    const { scan_window, ...rest } = valid;
    void scan_window;
    expect(scanResponseSchema.safeParse(rest).success).toBe(false);
  });
});

describe("tierFor", () => {
  it("classifies by confidence thresholds", () => {
    expect(tierFor(0.9)).toBe("normal");
    expect(tierFor(0.7)).toBe("normal");
    expect(tierFor(0.6)).toBe("low");
    expect(tierFor(0.5)).toBe("low");
    expect(tierFor(0.49)).toBe("drop");
    expect(tierFor(0)).toBe("drop");
  });
});
