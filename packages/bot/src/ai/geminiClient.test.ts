import { describe, it, expect } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
} from "./geminiClient.js";

describe("scan model defaults", () => {
  it("uses a non-deprecated Gemini default", () => {
    expect(DEFAULT_GEMINI_MODEL).not.toBe("gemini-2.0-flash");
    expect(DEFAULT_GEMINI_MODEL.length).toBeGreaterThan(0);
  });

  it("uses the Groq GPT OSS default instead of llama-3.3-70b-versatile", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });
});
