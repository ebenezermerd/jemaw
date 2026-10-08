/**
 * House style for what Jemaw says in chat: no em/en dashes and no semicolons.
 * Models love both, so every outgoing line passes through here. Plain text
 * only: run it before HTML escaping, since entities like &amp; contain ";".
 */
export function cleanReplyPunctuation(text: string): string {
  return text
    .replace(/\s*[—–;]\s*/g, ", ")
    // Collapse the commas this leaves behind, but keep digit groups like 1,200.
    .replace(/,(\s*,)+\s*/g, ", ")
    .replace(/,\s*([.!?…])/g, "$1")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "")
    .trim();
}
