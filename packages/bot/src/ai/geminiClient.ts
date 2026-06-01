/**
 * Gemini client abstraction. The interface lets tests inject a mock and the
 * deployed bot use the real API. Model gemini-2.5-flash (plan §6).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

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

export interface GeminiClient {
  suggest(input: ScanPromptInput): Promise<GeminiResult>;
}

/** Real client backed by @google/generative-ai. */
export function createGeminiClient(apiKey: string): GeminiClient {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  return {
    async suggest({ systemPrompt, userPrompt }) {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      const text = result.response.text();
      const usage = result.response.usageMetadata;
      return {
        json: JSON.parse(text),
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      };
    },
  };
}
