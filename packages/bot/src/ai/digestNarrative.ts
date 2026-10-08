/**
 * Two sentence AI narrative for the weekly digest. Reuses the scan client
 * (Groq with Gemini fallback). Best effort: any failure or malformed reply
 * returns null and the digest goes out without a narrative.
 */
import type { ScanClient } from "./geminiClient.js";
import type { WeeklyKpis } from "../domain/weeklyDigest.js";
import { centsToDecimal } from "@jemaw/shared/types";

const SYSTEM_PROMPT = [
  "You summarize a friend group's shared expense activity for a weekly chat digest.",
  "Reply as JSON: {\"summary\": string}.",
  "The summary must be EXACTLY two short sentences of plain text.",
  "Be concrete and neutral: what spending looked like this week and where the balances stand.",
  "No emojis, no markdown, no advice, no greetings.",
].join(" ");

export interface NarrativeInput {
  currency: string;
  kpis: WeeklyKpis;
  standings: { name: string; netCents: number }[];
  openDebts: { fromName: string; toName: string; amountCents: number }[];
}

export async function generateWeeklyNarrative(
  client: ScanClient | undefined,
  input: NarrativeInput,
): Promise<string | null> {
  if (!client) return null;
  try {
    const payload = {
      currency: input.currency,
      week: {
        spent: centsToDecimal(input.kpis.spentCents),
        expenses: input.kpis.expenseCount,
        settledBack: centsToDecimal(input.kpis.settledCents),
        settlements: input.kpis.settlementCount,
        topPayer: input.kpis.topPayerName,
      },
      standings: input.standings.map((s) => ({
        name: s.name,
        net: centsToDecimal(s.netCents),
      })),
      openDebts: input.openDebts.map((d) => ({
        from: d.fromName,
        to: d.toName,
        amount: centsToDecimal(d.amountCents),
      })),
    };
    const res = await client.suggest({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify(payload),
    });
    const summary = (res.json as { summary?: unknown })?.summary;
    if (typeof summary !== "string") return null;
    const trimmed = summary.trim();
    if (trimmed.length === 0 || trimmed.length > 400) return null;
    return trimmed;
  } catch (err) {
    console.warn(
      `[digest] narrative failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
