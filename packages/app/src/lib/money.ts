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

/**
 * Group the integer part with thousands separators, keeping any decimals and
 * sign: "4565.49" → "4,565.49", "-1200" → "-1,200". Pass-through if not numeric.
 */
export function formatNumber(value: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim());
  if (!m) return value;
  const grouped = m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${m[1]}${grouped}${m[3] ?? ""}`;
}

/** Format a decimal-string amount with its currency + thousands separators. */
export function formatMoney(value: string, currency: string): string {
  const n = formatNumber(value);
  if (SUFFIX[currency]) return `${n}${SUFFIX[currency]}`;
  const p = PREFIX[currency] ?? `${currency} `;
  return `${p}${n}`;
}

/** The currency's symbol and whether it goes after the number. */
export function currencyAffix(currency: string): {
  symbol: string;
  suffix: boolean;
} {
  if (SUFFIX[currency]) return { symbol: SUFFIX[currency], suffix: true };
  return { symbol: PREFIX[currency] ?? `${currency} `, suffix: false };
}
