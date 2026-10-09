/** Money in the group's own currency, keeping cents when there are any. */
export function fmtMoney(dec: string | number, currency: string): string {
  const n = Number(dec);
  const digits = Number.isInteger(n) ? 0 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: 2 })} ${currency}`;
}

/** A signed balance: + is owed money, − owes money. */
export function fmtNet(dec: string | number, currency: string): string {
  const n = Number(dec);
  if (n === 0) return `0 ${currency}`;
  return `${n > 0 ? "+" : "−"}${fmtMoney(Math.abs(n), currency)}`;
}

/** Short form for tiles: 68.6k, 1.2M. */
export function fmtCompact(dec: string | number): string {
  const n = Number(dec);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** "ebenezer merd" → "Ebenezer Merd". Display only; leaves @handles alone. */
export function titleCase(name: string): string {
  return name.replace(/(^|[\s\-'’(])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Max height that shows `rows` rows before the list starts to scroll. */
export const scrollAfter = (rows: number, rowHeight: number) => rows * rowHeight;
