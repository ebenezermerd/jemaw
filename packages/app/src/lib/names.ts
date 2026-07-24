/** Title-case one token (mjdd → Mjdd, MERDEKIOS → Merdekios). */
function capitalizeToken(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Full display name with each word capitalized. */
export function formatDisplayName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizeToken)
    .join(" ");
}

/**
 * Compact inline label: "Ebenezer Merdekios" → "Ebenezer M..."
 * Single names stay fully capitalized.
 */
export function formatCompactDisplayName(raw: string): string {
  const parts = formatDisplayName(raw).split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const lastInitial = parts[parts.length - 1]!.charAt(0);
    return `${first} ${lastInitial}...`;
  }
  return parts[0] ?? raw;
}

/**
 * Compact chip label: "Ebenezer Merdekios" → "Ebenezer M.."
 * Single names stay fully capitalized.
 */
export function formatMemberChipLabel(raw: string): string {
  const parts = formatDisplayName(raw).split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const lastInitial = parts[parts.length - 1]!.charAt(0);
    return `${first} ${lastInitial}..`;
  }
  return parts[0] ?? "Member";
}

/** First token of a display name, capitalized (greeting lines). */
export function firstDisplayName(raw: string): string {
  const parts = formatDisplayName(raw).split(/\s+/);
  return parts[0] ?? raw;
}

export function memberDisplayName(
  members: { id: string; displayName: string }[],
  id: string | null | undefined,
  fallback = "Member",
): string {
  if (!id) return fallback;
  const raw = members.find((m) => m.id === id)?.displayName ?? fallback;
  return formatDisplayName(raw);
}
