import { describe, it, expect } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
} from "./geminiClient.js";

describe("scan model defaults", () => {
  it("uses a working Gemini default for the current API key", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(DEFAULT_GEMINI_MODEL).not.toBe("gemini-2.0-flash");
  });

  it("uses Groq Llama as primary until the org allows gpt-oss models", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("llama-3.3-70b-versatile");
  });
});
