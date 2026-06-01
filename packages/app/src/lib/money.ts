/**
 * Currency formatting. Most currencies place the symbol BEFORE the number
 * (€12.50); some (ETB/Birr) read better AFTER (340 Br). One place so the whole
 * app is consistent.
 */
const PREFIX: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  JPY: "¥",
  CHF: "CHF ",
  CAD: "$",
  AUD: "$",
};

const SUFFIX: Record<string, string> = {
  ETB: " Br",
};

/** Format a decimal-string amount with its currency, prefix or suffix. */
export function formatMoney(value: string, currency: string): string {
  if (SUFFIX[currency]) return `${value}${SUFFIX[currency]}`;
  const p = PREFIX[currency] ?? `${currency} `;
  return `${p}${value}`;
}

/** The currency's symbol and whether it goes after the number. */
export function currencyAffix(currency: string): {
  symbol: string;
  suffix: boolean;
} {
  if (SUFFIX[currency]) return { symbol: SUFFIX[currency], suffix: true };
  return { symbol: PREFIX[currency] ?? `${currency} `, suffix: false };
}
