import { describe, it, expect } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  groqReasoningOptions,
} from "./geminiClient.js";

describe("scan model defaults", () => {
  it("uses a working Gemini default for the current API key", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(DEFAULT_GEMINI_MODEL).not.toBe("gemini-2.0-flash");
  });

  it("uses gpt-oss-120b on Groq now that Llama 3.3 is retired", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });
});

describe("groqReasoningOptions", () => {
  it("keeps gpt-oss reasoning low so JSON fits the token budget", () => {
    expect(groqReasoningOptions("openai/gpt-oss-120b")).toEqual({
      reasoning_effort: "low",
    });
    expect(groqReasoningOptions("openai/gpt-oss-20b")).toEqual({
      reasoning_effort: "low",
    });
  });

  it("sends nothing extra for models without reasoning controls", () => {
    expect(groqReasoningOptions("qwen/qwen3.8-27b")).toEqual({});
  });
});
