/**
 * House style for what Jemaw says in chat: no em/en dashes, no semicolons,
 * and plain "paid" instead of "fronted", which people read as "front-end".
 * Models love all three, so every outgoing line passes through here. Plain
 * text only: run it before HTML escaping, since entities like &amp; contain ";".
 */
export function cleanReplyPunctuation(text: string): string {
  return text
    .replace(/\bfronted\b/gi, (w) => (w[0] === "F" ? "Paid" : "paid"))
    .replace(/\bfronting\b/gi, (w) => (w[0] === "F" ? "Paying" : "paying"))
    .replace(/\s*[—–;]\s*/g, ", ")
    // Collapse the commas this leaves behind, but keep digit groups like 1,200.
    .replace(/,(\s*,)+\s*/g, ", ")
    .replace(/,\s*([.!?…])/g, "$1")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "")
    .trim();
}
