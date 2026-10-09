/**
 * Turn post data plus a design into what the bot sends: Rich Message blocks,
 * the classic HTML version (also the fallback for clients that can't show
 * rich messages), the keyboard rows and the images to render. Pure, so the
 * console preview and the bot produce the same post.
 */
import { centsToDecimal } from "../types.js";
import type { PostDesign, PostUseCase } from "./designs.js";
import {
  bold,
  htmlToRich,
  italic,
  richToHtml,
  richToPlain,
  type KeyboardButton,
  type RichBlock,
  type RichButton,
  type RichPhotoBlock,
  type RichTableCell,
  type RichText,
} from "./rich.js";

// ─── Data each use case is built from ─────────────────────────────────

export interface WeeklyPostData {
  groupName: string;
  currency: string;
  /** "Oct 3 – Oct 9" */
  periodLabel: string;
  spentCents: number;
  expenseCount: number;
  settledCents: number;
  memberCount: number;
  /** All-time nets, positive = owed money. */
  standings: { name: string; netCents: number }[];
  debts: { from: string; to: string; cents: number }[];
  /** This week's expenses, newest first. */
  expenses: { description: string; cents: number; payer: string; date: string }[];
  narrative: string | null;
}

export interface PaymentsPostData {
  currency: string;
  /** Null when the asker isn't on the books. */
  name: string | null;
  owes: { name: string; cents: number }[];
  owedBy: { name: string; cents: number }[];
  note: string | null;
  lead?: string | null;
}

export interface ReportPostData {
  title: string;
  /** The Telegram HTML answer; "• " lines become a list. */
  html: string;
  note: string | null;
  lead?: string | null;
}

export interface AnnouncementPostData {
  title: string;
  body: string;
}

export interface ReleasePostData {
  title: string;
  version?: string;
  intro?: string;
  added: string[];
  improved: string[];
  fixed: string[];
}

export type PostData =
  | { useCase: "weekly"; data: WeeklyPostData }
  | { useCase: "ai_payments"; data: PaymentsPostData }
  | { useCase: "ai_report"; data: ReportPostData }
  | { useCase: "announcement"; data: AnnouncementPostData }
  | { useCase: "release"; data: ReleasePostData };

export interface PostContext {
  /** Deep link that opens the Mini App on this group; null drops open buttons. */
  openUrl: string | null;
}

// ─── Images ──────────────────────────────────────────────────────────

export type ImageSpec =
  | { kind: "hero"; eyebrow: string; badge: string; amount: string; currency: string; subline: string }
  | { kind: "expense"; title: string; amount: string; currency: string; payer: string; date: string; subline: string }
  | { kind: "banner"; eyebrow: string; title: string; subline: string };

export const IMAGE_SIZE: Record<ImageSpec["kind"], { width: number; height: number }> = {
  hero: { width: 1280, height: 720 },
  expense: { width: 1280, height: 720 },
  banner: { width: 1280, height: 720 },
};

// ─── Output ──────────────────────────────────────────────────────────

export interface ComposedPost {
  useCase: PostUseCase;
  layout: PostDesign["layout"];
  /** Rich Message blocks; null for the classic layout. */
  rich: RichBlock[] | null;
  /** Classic HTML: the caption or text, and the fallback for rich posts. */
  html: string;
  /** Photo for the classic layout, sent with `html` as its caption when it fits. */
  photo: ImageSpec | null;
  /** Images referenced from rich blocks as "image:<index>". */
  images: ImageSpec[];
  /** Keyboard rows: always used by classic, and by rich posts with buttons below. */
  keyboard: KeyboardButton[][];
  buttonsPlacement: PostDesign["buttonsPlacement"];
}

export const CAPTION_LIMIT = 1024;

/** "1,200", "123.45" */
export function formatAmount(cents: number): string {
  const s = centsToDecimal(Math.abs(cents)).replace(/\.00$/, "");
  const [int, dec] = s.split(".");
  return `${cents < 0 ? "−" : ""}${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${dec ? `.${dec}` : ""}`;
}
const signed = (cents: number) => (cents > 0 ? `+${formatAmount(cents)}` : formatAmount(cents));

// ─── Intermediate document ───────────────────────────────────────────

interface DocTable {
  title: string;
  header: string[];
  rows: RichText[][];
  /** Column indexes aligned right (amounts). */
  right: number[];
  total?: { label: string; value: string };
}

interface ChecklistItem {
  /** "You → Ebenezer" */
  who: RichText;
  amount: string;
  checked: boolean;
}

interface Doc {
  title: string;
  subtitle?: string;
  lead: RichText[];
  hero?: ImageSpec;
  slides: ImageSpec[];
  stats: { value: string; label: string }[];
  tables: DocTable[];
  checklist?: { title: string; items: ChecklistItem[]; empty: string };
  lists: { title: string; items: RichText[] }[];
  note?: string;
  copyAmount?: string;
}

const emptyDoc = (title: string): Doc => ({ title, lead: [], slides: [], stats: [], tables: [], lists: [] });

function weeklyDoc(d: WeeklyPostData, design: PostDesign): Doc {
  const doc = emptyDoc("Weekly report");
  const s = design.sections;
  doc.subtitle = `${d.periodLabel} · ${d.groupName}`;
  const spent = formatAmount(d.spentCents);
  const people = `${d.memberCount} ${d.memberCount === 1 ? "person" : "people"}`;
  const paybacks = d.debts.length ? `${d.debts.length} pending payback${d.debts.length === 1 ? "" : "s"}` : "all square";
  doc.hero = {
    kind: "hero",
    eyebrow: "This week in the group",
    badge: d.periodLabel,
    amount: spent,
    currency: d.currency,
    subline: `${d.expenseCount} expense${d.expenseCount === 1 ? "" : "s"} · ${people} · ${paybacks}`,
  };
  doc.slides = [
    doc.hero,
    ...d.expenses.slice(0, 9).map((e, i, shown): ImageSpec => ({
      kind: "expense",
      title: e.description,
      amount: formatAmount(e.cents),
      currency: d.currency,
      payer: e.payer,
      date: e.date,
      subline: `Expense ${i + 1} of ${shown.length} this week`,
    })),
  ];
  doc.lead.push([`${d.expenseCount} expense${d.expenseCount === 1 ? "" : "s"} this week, `, bold(`${spent} ${d.currency}`), " in total."]);
  if (s.stats) {
    doc.stats = [
      { value: `${spent} ${d.currency}`, label: "spent" },
      { value: String(d.expenseCount), label: d.expenseCount === 1 ? "expense" : "expenses" },
      { value: `${formatAmount(d.settledCents)} ${d.currency}`, label: "settled" },
    ];
  }
  if (s.expenses && d.expenses.length) {
    doc.tables.push({
      title: "This week",
      header: ["Date", "What", "Paid by", d.currency],
      rows: d.expenses.slice(0, 15).map((e) => [e.date, e.description, e.payer, formatAmount(e.cents)]),
      right: [3],
      total: { label: "Total", value: spent },
    });
  }
  if (s.standings) {
    const rows = d.standings.filter((x) => x.netCents !== 0);
    if (rows.length) {
      doc.tables.push({
        title: "Standings",
        header: ["Member", "Balance"],
        rows: rows.map((x) => [x.name, bold(signed(x.netCents))]),
        right: [1],
      });
    }
  }
  if (s.debts) {
    doc.checklist = {
      title: "Who pays whom",
      items: d.debts.map((x) => ({ who: [bold(x.from), " → ", x.to], amount: `${formatAmount(x.cents)} ${d.currency}`, checked: false })),
      empty: "Everyone is square.",
    };
  }
  if (s.note && d.narrative) doc.note = d.narrative;
  doc.copyAmount = centsToDecimal(d.spentCents).replace(/\.00$/, "");
  return doc;
}

function paymentsDoc(d: PaymentsPostData, design: PostDesign): Doc {
  const doc = emptyDoc("Your open payments");
  if (d.lead) doc.lead.push(d.lead);
  if (!d.name) {
    doc.lead.push("I can't find you on the books yet. Say something in the group or open the app once, then ask again.");
    return doc;
  }
  const total = d.owes.reduce((a, x) => a + x.cents, 0);
  doc.hero = {
    kind: "hero",
    eyebrow: total ? "You owe" : "You're owed",
    badge: d.name,
    amount: formatAmount(total || d.owedBy.reduce((a, x) => a + x.cents, 0)),
    currency: d.currency,
    subline: `${d.owes.length} to pay · ${d.owedBy.length} to receive`,
  };
  doc.checklist = {
    title: total ? `You owe ${formatAmount(total)} ${d.currency}` : "Your open payments",
    items: [
      ...d.owes.map((x) => ({ who: ["You → ", bold(x.name)] as RichText, amount: `${formatAmount(x.cents)} ${d.currency}`, checked: false })),
      ...d.owedBy.map((x) => ({ who: [bold(x.name), " → you"] as RichText, amount: `${formatAmount(x.cents)} ${d.currency}`, checked: false })),
    ],
    empty: "You're all square. Nobody owes you and you owe nobody.",
  };
  if (design.sections.note && d.note) doc.note = d.note;
  if (d.owes[0]) doc.copyAmount = centsToDecimal(d.owes[0].cents).replace(/\.00$/, "");
  return doc;
}

/** Split a Telegram HTML answer into a heading, paragraphs and bullet lists. */
function reportDoc(d: ReportPostData, design: PostDesign): Doc {
  const doc = emptyDoc(d.title);
  if (d.lead) doc.lead.push(d.lead);
  let list: { title: string; items: RichText[] } | null = null;
  for (const raw of d.html.split("\n")) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const heading = /^<b>([^<]+)<\/b>$/.exec(line);
    if (heading) {
      const title = richToPlain(htmlToRich(heading[1]!));
      // The doc heading already says it; don't repeat it over the list.
      list = { title: title === d.title ? "" : title, items: [] };
      doc.lists.push(list);
      continue;
    }
    if (line.startsWith("• ")) {
      if (!list) {
        list = { title: "", items: [] };
        doc.lists.push(list);
      }
      list.items.push(htmlToRich(line.slice(2)));
      continue;
    }
    list = null;
    doc.lead.push(htmlToRich(line));
  }
  if (design.sections.note && d.note) doc.note = d.note;
  return doc;
}

function announcementDoc(d: AnnouncementPostData): Doc {
  const doc = emptyDoc(d.title);
  doc.hero = { kind: "banner", eyebrow: "Announcement", title: d.title, subline: "From the Jemaw team" };
  doc.lead = d.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return doc;
}

function releaseDoc(d: ReleasePostData): Doc {
  const doc = emptyDoc(d.title);
  if (d.version) doc.subtitle = `Version ${d.version}`;
  doc.hero = { kind: "banner", eyebrow: d.version ? `What's new · ${d.version}` : "What's new", title: d.title, subline: "Jemaw release notes" };
  if (d.intro) doc.lead = d.intro.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const add = (title: string, items: string[]) => {
    const clean = items.map((x) => x.trim()).filter(Boolean);
    if (clean.length) doc.lists.push({ title, items: clean });
  };
  add("✨ New", d.added);
  add("⚡ Improved", d.improved);
  add("🛠 Fixed", d.fixed);
  return doc;
}

function buildDoc(input: PostData, design: PostDesign): Doc {
  switch (input.useCase) {
    case "weekly":
      return weeklyDoc(input.data, design);
    case "ai_payments":
      return paymentsDoc(input.data, design);
    case "ai_report":
      return reportDoc(input.data, design);
    case "announcement":
      return announcementDoc(input.data);
    case "release":
      return releaseDoc(input.data);
  }
}

// ─── Buttons ─────────────────────────────────────────────────────────

function resolveButtons(design: PostDesign, doc: Doc, ctx: PostContext): KeyboardButton[][] {
  return design.buttons
    .map((row) =>
      row.flatMap((b): KeyboardButton[] => {
        const style = b.style === "default" ? {} : { style: b.style };
        if (b.action === "open_app") return ctx.openUrl ? [{ text: b.label, url: ctx.openUrl, ...style }] : [];
        if (b.action === "url") return b.url ? [{ text: b.label, url: b.url, ...style }] : [];
        // Telegram draws its own copy icon on copy buttons, so the label stays plain.
        return doc.copyAmount ? [{ text: b.label, copy_text: { text: doc.copyAmount }, ...style }] : [];
      }),
    )
    .filter((row) => row.length > 0);
}

// ─── Rich renderers ──────────────────────────────────────────────────

const cell = (text: RichText, o: Partial<RichTableCell> = {}): RichTableCell => ({ text, align: "left", valign: "middle", ...o });

function tableBlock(t: DocTable, compact: boolean): RichBlock {
  const align = (i: number) => (t.right.includes(i) ? "right" : "left") as RichTableCell["align"];
  const cells: RichTableCell[][] = [
    t.header.map((h, i) => cell(h, { is_header: true, align: align(i) })),
    ...t.rows.map((r) => r.map((c, i) => cell(c, { align: align(i) }))),
  ];
  if (t.total) {
    cells.push([
      cell(bold(t.total.label), { ...(t.header.length > 2 ? { colspan: t.header.length - 1 } : {}) }),
      cell(bold(t.total.value), { align: "right" }),
    ]);
  }
  return { type: "table", is_striped: true, ...(compact ? { is_compact: true } : { is_bordered: true }), cells };
}

function statsBlock(stats: Doc["stats"]): RichBlock {
  return {
    type: "table",
    is_bordered: true,
    cells: [
      stats.map((s) => cell(bold(s.value), { align: "center" })),
      stats.map((s) => cell(s.label, { align: "center" })),
    ],
  };
}

function checklistBlocks(c: NonNullable<Doc["checklist"]>, style: PostDesign["checklistStyle"], heading: boolean): RichBlock[] {
  const out: RichBlock[] = [];
  if (heading && c.title) out.push({ type: "heading", size: 3, text: c.title });
  if (c.items.length === 0) {
    out.push({ type: "paragraph", text: c.empty });
    return out;
  }
  if (style === "table") {
    out.push({
      type: "table",
      is_striped: true,
      cells: c.items.map((x) => [cell(x.checked ? "✓" : "○", { align: "center" }), cell(x.who), cell(bold(x.amount), { align: "right" })]),
    });
  } else {
    out.push({
      type: "list",
      items: c.items.map((x) => ({
        has_checkbox: true as const,
        ...(x.checked ? { is_checked: true as const } : {}),
        blocks: [{ type: "paragraph" as const, text: [x.who, " · ", bold(x.amount)] }],
      })),
    });
  }
  return out;
}

const listBlock = (items: RichText[]): RichBlock => ({
  type: "list",
  items: items.map((text) => ({ blocks: [{ type: "paragraph" as const, text }] })),
});

/**
 * Buttons inside the message sit side by side in one row (Telegram allows up
 * to 8); three or more are centred, one or two start at the left edge.
 */
function richButtons(rows: KeyboardButton[][]): RichBlock[] {
  const all = rows.flat().slice(0, 8);
  if (all.length === 0) return [];
  return [
    {
      type: "buttons",
      align: all.length > 2 ? "center" : "left",
      buttons: all.map((b): RichButton => ({ text: b.text, ...(b.style ? { style: b.style } : {}), ...(b.url ? { url: b.url } : {}), ...(b.copy_text ? { copy_text: b.copy_text } : {}) })),
    },
  ];
}

function heroBlocks(doc: Doc, design: PostDesign, images: ImageSpec[]): RichBlock[] {
  const photo = (spec: ImageSpec): RichPhotoBlock => {
    images.push(spec);
    return { type: "photo", photo: { type: "photo", media: `image:${images.length - 1}` } };
  };
  if (design.hero === "none" || !doc.hero) return [];
  if (design.hero === "slideshow" && doc.slides.length > 1) return [{ type: "slideshow", blocks: doc.slides.map(photo) }];
  return [photo(doc.hero)];
}

function footerBlocks(design: PostDesign): RichBlock[] {
  return design.footer ? [{ type: "divider" }, { type: "footer", text: design.footer }] : [];
}

function article(doc: Doc, design: PostDesign, images: ImageSpec[]): RichBlock[] {
  const out: RichBlock[] = [...heroBlocks(doc, design, images), { type: "heading", size: 1, text: doc.title }];
  if (doc.subtitle) out.push({ type: "paragraph", text: italic(doc.subtitle) });
  for (const p of doc.lead) out.push({ type: "paragraph", text: p });
  if (doc.stats.length) out.push({ type: "paragraph", text: doc.stats.flatMap((s, i) => [...(i ? [" · "] : []), bold(s.value), ` ${s.label}`]) });
  for (const t of doc.tables) out.push({ type: "heading", size: 3, text: t.title }, tableBlock(t, true));
  if (doc.checklist) out.push(...checklistBlocks(doc.checklist, design.checklistStyle, true));
  for (const l of doc.lists) {
    if (l.title) out.push({ type: "heading", size: 3, text: l.title });
    out.push(listBlock(l.items));
  }
  if (doc.note) out.push({ type: "paragraph", text: italic(doc.note) });
  return out;
}

function showcase(doc: Doc, design: PostDesign, images: ImageSpec[]): RichBlock[] {
  const out: RichBlock[] = [...heroBlocks(doc, design, images), { type: "heading", size: 2, text: doc.title }];
  if (doc.subtitle) out.push({ type: "paragraph", text: italic(doc.subtitle) });
  if (!doc.tables.length) for (const p of doc.lead) out.push({ type: "paragraph", text: p });
  if (doc.stats.length) out.push(statsBlock(doc.stats));
  doc.tables.forEach((t, i) => {
    if (i > 0) out.push({ type: "heading", size: 3, text: t.title });
    out.push(tableBlock(t, true));
  });
  if (doc.checklist) {
    out.push({
      type: "details",
      summary: doc.checklist.title,
      blocks: checklistBlocks(doc.checklist, design.checklistStyle, false),
    });
  }
  for (const l of doc.lists) {
    if (l.title) out.push({ type: "heading", size: 3, text: l.title });
    out.push(listBlock(l.items));
  }
  if (doc.note) out.push({ type: "expandable_blockquote", text: doc.note, credit: "Jemaw" });
  return out;
}

function checklist(doc: Doc, design: PostDesign, images: ImageSpec[]): RichBlock[] {
  const out: RichBlock[] = [...heroBlocks(doc, design, images)];
  for (const p of doc.lead) out.push({ type: "paragraph", text: p });
  if (doc.checklist) out.push(...checklistBlocks(doc.checklist, design.checklistStyle, true));
  else out.push({ type: "heading", size: 3, text: doc.title });
  for (const l of doc.lists) {
    if (l.title) out.push({ type: "heading", size: 4, text: l.title });
    out.push({
      type: "list",
      items: l.items.map((text) => ({ has_checkbox: true as const, blocks: [{ type: "paragraph" as const, text }] })),
    });
  }
  if (doc.note) out.push({ type: "paragraph", text: italic(doc.note) });
  return out;
}

// ─── Classic HTML ────────────────────────────────────────────────────

function classicHtml(doc: Doc): string {
  const parts: string[] = [];
  parts.push(`<b>${richToHtml(doc.title)}</b>${doc.subtitle ? `\n<i>${richToHtml(doc.subtitle)}</i>` : ""}`);
  for (const p of doc.lead) parts.push(richToHtml(p));
  if (doc.stats.length) parts.push(doc.stats.map((s) => `<b>${richToHtml(s.value)}</b> ${richToHtml(s.label)}`).join(" · "));
  for (const t of doc.tables) {
    const rows = t.rows.map((r) => r.map(richToPlain));
    if (t.total) rows.push([t.total.label, ...Array(Math.max(0, t.header.length - 2)).fill(""), t.total.value]);
    const width = t.header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
    const line = (r: string[]) =>
      r.map((c, i) => (t.right.includes(i) ? c.padStart(width[i]!) : c.padEnd(width[i]!))).join("  ").trimEnd();
    const body = [line(t.header), ...rows.map(line)].join("\n");
    parts.push(`<b>${richToHtml(t.title)}</b>\n<pre>${richToHtml(body)}</pre>`);
  }
  if (doc.checklist) {
    const c = doc.checklist;
    const items = c.items.length
      ? c.items.map((x) => `${x.checked ? "☑" : "☐"} ${richToHtml(x.who)} · <b>${richToHtml(x.amount)}</b>`).join("\n")
      : richToHtml(c.empty);
    parts.push(`<b>${richToHtml(c.title)}</b>\n${items}`);
  }
  for (const l of doc.lists) {
    const items = l.items.map((i) => `• ${richToHtml(i)}`).join("\n");
    parts.push(l.title ? `<b>${richToHtml(l.title)}</b>\n${items}` : items);
  }
  if (doc.note) parts.push(`<i>${richToHtml(doc.note)}</i>`);
  return parts.join("\n\n");
}

// ─── Entry point ─────────────────────────────────────────────────────

export function composePost(input: PostData, design: PostDesign, ctx: PostContext): ComposedPost {
  const doc = buildDoc(input, design);
  const keyboard = resolveButtons(design, doc, ctx);
  const footer = design.footer ? `\n\n<i>${richToHtml(design.footer)}</i>` : "";
  const html = classicHtml(doc) + footer;
  const photo = design.hero !== "none" && doc.hero ? doc.hero : null;
  const base = { useCase: input.useCase, layout: design.layout, html, photo, buttonsPlacement: design.buttonsPlacement };

  if (design.layout === "classic") return { ...base, rich: null, images: [], keyboard };

  const images: ImageSpec[] = [];
  const body =
    design.layout === "article" ? article(doc, design, images)
    : design.layout === "showcase" ? showcase(doc, design, images)
    : checklist(doc, design, images);
  const inside = design.buttonsPlacement === "inside" ? richButtons(keyboard) : [];
  return { ...base, rich: [...body, ...inside, ...footerBlocks(design)], images, keyboard };
}
