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
  /** Default 0 for extraction stability; humor may raise this. */
  temperature?: number;
  /** Optional completion budget (humor stays small). */
  maxTokens?: number;
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

/**
 * Defaults are models verified working with the current production keys.
 * Override with GEMINI_MODEL / GROQ_MODEL so production can change without a code push.
 * Note: Groq retired llama-3.3-70b-versatile in Oct 2026; gemini-2.0-flash is
 * quota-exhausted and gemini-2.5-flash-lite is unavailable for this API key.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * gpt-oss models reason before answering and the reasoning counts against
 * max_tokens; at the default effort it can exhaust the budget mid-JSON.
 */
export function groqReasoningOptions(
  model: string,
): { reasoning_effort?: "low" } {
  return model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {};
}

/** Gemini backend (JSON mode, temperature 0). Model id is configurable. */
export function createGeminiClient(apiKey: string, model?: string): ScanClient {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = model?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    async suggest({ systemPrompt, userPrompt, temperature, maxTokens }) {
      const generativeModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: temperature ?? 0,
          ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
        },
      });
      const result = await generativeModel.generateContent(userPrompt);
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
 * Groq backend via its OpenAI-compatible API. JSON mode at temperature 0 for
 * stable extraction. Default model is overridable with GROQ_MODEL.
 */
export function createGroqClient(
  apiKey: string,
  model?: string | (() => string | null | undefined),
): ScanClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  // Resolved per call so an admin override takes effect without a restart.
  const resolveModel = () =>
    (typeof model === "function" ? model() : model)?.trim() || DEFAULT_GROQ_MODEL;
  return {
    async suggest({ systemPrompt, userPrompt, temperature, maxTokens }) {
      const modelName = resolveModel();
      const res = await client.chat.completions.create({
        model: modelName,
        temperature: temperature ?? 0,
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
        ...groqReasoningOptions(modelName),
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
