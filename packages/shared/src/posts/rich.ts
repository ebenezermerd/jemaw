/**
 * The subset of Telegram's Rich Message types (Bot API 10.1+) that our
 * layouts use, plus conversions to Telegram HTML and plain text for the
 * classic layout and for clients that can't show rich messages.
 */

export type RichText =
  | string
  | RichText[]
  | { type: "bold" | "italic" | "marked" | "code" | "underline" | "strikethrough"; text: RichText }
  | { type: "url"; text: RichText; url: string };

export interface RichTableCell {
  text?: RichText;
  is_header?: true;
  colspan?: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
}

export interface RichButton {
  text: string;
  style?: "primary" | "success" | "danger";
  url?: string;
  copy_text?: { text: string };
}

/** A photo's media is an image reference ("image:0") until the sender swaps in the file. */
export interface RichPhotoBlock {
  type: "photo";
  photo: { type: "photo"; media: string };
  caption?: { text: RichText; credit?: RichText };
}

export type RichBlock =
  | { type: "paragraph"; text: RichText }
  | { type: "heading"; size: number; text: RichText }
  | { type: "footer"; text: RichText }
  | { type: "divider" }
  | { type: "list"; items: { blocks: RichBlock[]; has_checkbox?: true; is_checked?: true }[] }
  | { type: "blockquote"; blocks: RichBlock[]; credit?: RichText }
  | { type: "expandable_blockquote"; text: RichText; credit?: RichText }
  | {
      type: "table";
      cells: RichTableCell[][];
      is_bordered?: true;
      is_striped?: true;
      is_compact?: true;
      caption?: RichText;
    }
  | { type: "details"; summary: RichText; blocks: RichBlock[]; is_open?: true }
  | { type: "buttons"; buttons: RichButton[]; align?: "left" | "center" | "right" }
  | RichPhotoBlock
  | { type: "slideshow"; blocks: RichPhotoBlock[]; caption?: { text: RichText; credit?: RichText } };

export interface KeyboardButton {
  text: string;
  url?: string;
  copy_text?: { text: string };
  style?: "primary" | "success" | "danger";
}

export const bold = (text: RichText): RichText => ({ type: "bold", text });
export const italic = (text: RichText): RichText => ({ type: "italic", text });

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const HTML_TAG: Record<string, string> = {
  bold: "b",
  italic: "i",
  code: "code",
  underline: "u",
  strikethrough: "s",
  marked: "b",
};

/** Telegram HTML for ordinary messages. */
export function richToHtml(t: RichText): string {
  if (typeof t === "string") return escapeHtml(t);
  if (Array.isArray(t)) return t.map(richToHtml).join("");
  if (t.type === "url") return `<a href="${escapeHtml(t.url)}">${richToHtml(t.text)}</a>`;
  const tag = HTML_TAG[t.type]!;
  return `<${tag}>${richToHtml(t.text)}</${tag}>`;
}

export function richToPlain(t: RichText): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map(richToPlain).join("");
  return richToPlain(t.text);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"' };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot);/g, (m) => ENTITIES[m]!);

/**
 * Parse the small Telegram HTML subset our text answers use (b, i, u, s,
 * code, a) into rich text. Unknown tags are dropped, their text kept.
 */
export function htmlToRich(html: string): RichText {
  const root: RichText[] = [];
  const stack: { type: string; url?: string; children: RichText[] }[] = [];
  const push = (node: RichText) => (stack.at(-1)?.children ?? root).push(node);
  const re = /<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    if (m[4] != null) {
      push(decode(m[4]));
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    const type =
      tag === "b" || tag === "strong" ? "bold"
      : tag === "i" || tag === "em" ? "italic"
      : tag === "u" ? "underline"
      : tag === "s" ? "strikethrough"
      : tag === "code" ? "code"
      : tag === "a" ? "url"
      : null;
    if (!type) continue;
    if (!closing) {
      const href = /href="([^"]*)"/.exec(m[3] ?? "")?.[1];
      stack.push({ type, ...(href ? { url: decode(href) } : {}), children: [] });
      continue;
    }
    const open = stack.pop();
    if (!open) continue;
    const text: RichText = open.children.length === 1 ? open.children[0]! : open.children;
    push(open.type === "url" ? { type: "url", text, url: open.url ?? "" } : ({ type: open.type, text } as RichText));
  }
  // Close anything left open rather than losing its text.
  while (stack.length) {
    const open = stack.pop()!;
    push(open.children);
  }
  return root.length === 1 ? root[0]! : root;
}
