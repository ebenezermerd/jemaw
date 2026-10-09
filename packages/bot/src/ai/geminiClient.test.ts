import { describe, it, expect } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  createGroqClient,
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

describe("createGroqClient rate limits", () => {
  it("reports Groq's remaining limits from the response headers", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          id: "x",
          object: "chat.completion",
          created: 0,
          model: "openai/gpt-oss-120b",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "999",
            "x-ratelimit-limit-tokens": "8000",
            "x-ratelimit-remaining-tokens": "7988",
            "x-ratelimit-reset-tokens": "90ms",
          },
        },
      )) as unknown as typeof fetch;
    const seen: unknown[] = [];
    const client = createGroqClient("k", "openai/gpt-oss-120b", { fetch: fakeFetch, onLimits: (s) => seen.push(s) });
    const res = await client.suggest({ systemPrompt: "s", userPrompt: "u" });
    expect(res.json).toEqual({ ok: true });
    expect(seen[0]).toMatchObject({
      model: "openai/gpt-oss-120b",
      requests: { limit: 1000, remaining: 999 },
      tokens: { limit: 8000, remaining: 7988, resetSeconds: 0.1 },
    });
  });
});
