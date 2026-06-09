/**
 * Scan client abstraction. One interface, two backends (Groq and Gemini), so the
 * scan code and tests stay provider-agnostic. The name `GeminiClient` is kept as
 * an alias for back-compat; new code can use `ScanClient`.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export interface ScanPromptInput {
  systemPrompt: string;
  userPrompt: string;
}

export interface GeminiResult {
  /** Parsed JSON value (unknown shape; validated by the caller). */
  json: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ScanClient {
  suggest(input: ScanPromptInput): Promise<GeminiResult>;
}

/** @deprecated use ScanClient — kept so existing imports keep working. */
export type GeminiClient = ScanClient;

/** Gemini backend (gemini-2.0-flash — fast extraction, JSON mode). */
export function createGeminiClient(apiKey: string): ScanClient {
  const genAI = new GoogleGenerativeAI(apiKey);
  return {
    async suggest({ systemPrompt, userPrompt }) {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      });
      const result = await model.generateContent(userPrompt);
      const usage = result.response.usageMetadata;
      return {
        json: JSON.parse(result.response.text()),
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      };
    },
  };
}

/**
 * Groq backend via its OpenAI-compatible API. Much higher tokens/sec and a
 * generous free tier; the model runs JSON mode at temperature 0 for stable
 * extraction. Default model is overridable with GROQ_MODEL.
 */
export function createGroqClient(apiKey: string, model?: string): ScanClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  const modelName = model ?? "llama-3.3-70b-versatile";
  return {
    async suggest({ systemPrompt, userPrompt }) {
      const res = await client.chat.completions.create({
        model: modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const text = res.choices[0]?.message?.content ?? "{}";
      return {
        json: JSON.parse(text),
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
      };
    },
  };
}

/**
 * Compose a primary client with a fallback: if the primary throws (rate limit,
 * outage), retry once on the fallback so a single provider hiccup doesn't drop
 * the scan.
 */
export function withFallback(
  primary: ScanClient,
  fallback: ScanClient,
): ScanClient {
  return {
    async suggest(input) {
      try {
        return await primary.suggest(input);
      } catch (err) {
        console.warn(
          `[scan] primary client failed, falling back:`,
          err instanceof Error ? err.message : err,
        );
        return fallback.suggest(input);
      }
    },
  };
}
