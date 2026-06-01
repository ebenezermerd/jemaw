/**
 * Home: the personal summary card on top, then the most relevant content —
 * the suggestions inbox if any are pending (plan §13.2), else balances.
 */
import { useMeSummary, useSuggestions } from "../lib/hooks.js";
import { SummaryCard } from "../ui/SummaryCard.js";
import { Skeleton } from "../motion/Skeleton.js";
import { Suggestions } from "./Suggestions.js";
import { Balances } from "./Balances.js";

export function Home() {
  const summary = useMeSummary();
  const suggestions = useSuggestions();
  const pending = suggestions.data?.suggestions.length ?? 0;

  return (
    <div>
      <div style={{ padding: 16, paddingBottom: 0 }}>
        {summary.isLoading || !summary.data ? (
          <Skeleton height={184} radius="var(--r-xl)" />
        ) : (
          <SummaryCard s={summary.data} />
        )}
      </div>
      {/* Embed the most relevant list below the card. */}
      {pending > 0 ? <Suggestions /> : <Balances />}
    </div>
  );
}
