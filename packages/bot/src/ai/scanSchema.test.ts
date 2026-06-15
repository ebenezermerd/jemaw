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

  it("accepts a loan suggestion kind", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [
        {
          ...valid.suggestions[0],
          kind: "loan",
          description: "Sara lent Tom money",
          split_type: "exact",
          split_with: [456],
        },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions[0]!.kind).toBe("loan");
  });

  it("drops a suggestion with confidence out of range (keeps the response)", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [
        valid.suggestions[0],
        { ...valid.suggestions[0], confidence: 1.5 },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions).toHaveLength(1);
  });

  it("drops a suggestion with a non-positive amount (keeps the response)", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [
        valid.suggestions[0],
        { ...valid.suggestions[0], amount: 0 },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions).toHaveLength(1);
  });

  it("tolerates a missing scan_window (advisory only)", () => {
    const { scan_window, ...rest } = valid;
    void scan_window;
    expect(scanResponseSchema.safeParse(rest).success).toBe(true);
  });

  it("keeps valid suggestions when another item is malformed", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [
        valid.suggestions[0],
        { confidence: 0.9, description: "broken" }, // missing required fields
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions).toHaveLength(1);
  });

  it("does not let a null settlement member id discard the whole scan", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      settlements: [
        {
          confidence: 0.8,
          from_telegram_id: null, // the field that was failing in production
          to_telegram_id: 456,
          amount: 200,
          currency: "ETB",
          evidence_message_ids: [10],
          reasoning: "payback",
        },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions).toHaveLength(1); // expense survives
    expect(r.success && r.data.settlements).toHaveLength(0); // bad one dropped
  });

  it("strips stray nulls from evidence_message_ids", () => {
    const r = scanResponseSchema.safeParse({
      ...valid,
      suggestions: [
        { ...valid.suggestions[0], evidence_message_ids: [101, null, 103] },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.suggestions[0]!.evidence_message_ids).toEqual([
      101, 103,
    ]);
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
