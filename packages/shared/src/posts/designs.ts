/**
 * Message designs: which layout each kind of bot post uses, chosen in the
 * admin console and stored in app_config. The bot, the API and the console
 * all read the same model, so a preview matches what the group receives.
 */

export const POST_USE_CASES = ["weekly", "ai_payments", "ai_report", "announcement", "release"] as const;
export type PostUseCase = (typeof POST_USE_CASES)[number];

/**
 * classic = an ordinary message (photo + caption or text) with button rows.
 * article = Rich Message report: headings, paragraphs, lists, footer.
 * showcase = Rich Message with a hero image or slideshow, tables and buttons.
 * checklist = Rich Message checklist of payments, or a headerless table.
 */
export const POST_LAYOUTS = ["classic", "article", "showcase", "checklist"] as const;
export type PostLayout = (typeof POST_LAYOUTS)[number];

export const POST_SECTIONS = ["stats", "expenses", "standings", "debts", "note"] as const;
export type PostSection = (typeof POST_SECTIONS)[number];

export type PostButtonAction = "open_app" | "copy_amount" | "url";
export type PostButtonStyle = "primary" | "success" | "danger" | "default";

export interface PostButton {
  label: string;
  action: PostButtonAction;
  /** Only for action "url". */
  url?: string;
  style: PostButtonStyle;
}

export interface PostDesign {
  layout: PostLayout;
  /** Image above the post; "slideshow" swipes through the hero and expense cards. */
  hero: "none" | "image" | "slideshow";
  /** "below" uses Telegram's keyboard rows; "inside" puts them in the message body. */
  buttonsPlacement: "below" | "inside";
  /** Rows of buttons, at most 3 rows of 3. */
  buttons: PostButton[][];
  checklistStyle: "checklist" | "table";
  sections: Record<PostSection, boolean>;
  /** Small print at the end; empty for none. */
  footer: string;
}

export type PostDesigns = Record<PostUseCase, PostDesign>;

export interface PostUseCaseMeta {
  label: string;
  description: string;
  /** Sections that mean something for this use case, in display order. */
  sections: PostSection[];
}

export const POST_USE_CASE_META: Record<PostUseCase, PostUseCaseMeta> = {
  weekly: {
    label: "Weekly report",
    description: "The digest the bot posts in each group once a week.",
    sections: ["stats", "expenses", "standings", "debts", "note"],
  },
  ai_payments: {
    label: "AI: my payments",
    description: "When someone asks what they still owe or who owes them.",
    sections: ["note"],
  },
  ai_report: {
    label: "AI: reports",
    description: "Totals, expense lists and other summaries the AI answers with.",
    sections: ["note"],
  },
  announcement: {
    label: "Announcements",
    description: "Messages sent from the console to groups or people.",
    sections: [],
  },
  release: {
    label: "Feature releases",
    description: "What's new, improved and fixed in Jemaw.",
    sections: [],
  },
};

export const SECTION_LABEL: Record<PostSection, { label: string; hint: string }> = {
  stats: { label: "Key numbers", hint: "Spent, expense count and settled amount" },
  expenses: { label: "Expenses table", hint: "This week's expenses with a total row" },
  standings: { label: "Standings", hint: "Everyone's all-time balance" },
  debts: { label: "Who pays whom", hint: "Open paybacks" },
  note: { label: "Jemaw's comment", hint: "The AI line under the numbers" },
};

const OPEN: PostButton = { label: "Open Jemaw", action: "open_app", style: "primary" };
const allSections = (on: boolean): Record<PostSection, boolean> =>
  Object.fromEntries(POST_SECTIONS.map((s) => [s, on])) as Record<PostSection, boolean>;

export const DEFAULT_POST_DESIGNS: PostDesigns = {
  weekly: {
    layout: "showcase",
    hero: "image",
    buttonsPlacement: "below",
    buttons: [[OPEN], [{ label: "Copy total", action: "copy_amount", style: "default" }]],
    checklistStyle: "checklist",
    sections: { stats: false, expenses: true, standings: false, debts: true, note: true },
    footer: "",
  },
  ai_payments: {
    layout: "checklist",
    hero: "none",
    buttonsPlacement: "below",
    buttons: [[{ label: "Settle up", action: "open_app", style: "success" }]],
    checklistStyle: "checklist",
    sections: allSections(true),
    footer: "",
  },
  ai_report: {
    layout: "article",
    hero: "none",
    buttonsPlacement: "below",
    buttons: [],
    checklistStyle: "checklist",
    sections: allSections(true),
    footer: "",
  },
  announcement: {
    layout: "article",
    hero: "none",
    buttonsPlacement: "below",
    buttons: [[OPEN]],
    checklistStyle: "checklist",
    sections: allSections(true),
    footer: "",
  },
  release: {
    layout: "article",
    hero: "none",
    buttonsPlacement: "below",
    buttons: [[OPEN]],
    checklistStyle: "checklist",
    sections: allSections(true),
    footer: "Thanks for using Jemaw",
  },
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
const text = (v: unknown, max: number, d: string) =>
  typeof v === "string" ? v.trim().slice(0, max) : d;

function parseButton(raw: unknown): PostButton | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = text(r.label, 40, "");
  if (!label) return null;
  const action = pick(r.action, ["open_app", "copy_amount", "url"] as const, "open_app");
  const url = typeof r.url === "string" && /^(https:\/\/|tg:\/\/)/.test(r.url.trim()) ? r.url.trim().slice(0, 500) : undefined;
  if (action === "url" && !url) return null;
  return { label, action, ...(action === "url" ? { url } : {}), style: pick(r.style, ["primary", "success", "danger", "default"] as const, "default") };
}

/** Coerce one stored design, filling anything missing or off-type from the default. */
export function parsePostDesign(raw: unknown, d: PostDesign): PostDesign {
  if (!raw || typeof raw !== "object") return structuredClone(d);
  const r = raw as Record<string, unknown>;
  const rawSections = (r.sections && typeof r.sections === "object" ? r.sections : {}) as Record<string, unknown>;
  const buttons = Array.isArray(r.buttons)
    ? r.buttons
        .filter(Array.isArray)
        .map((row) => (row as unknown[]).map(parseButton).filter((b): b is PostButton => b != null).slice(0, 3))
        .filter((row) => row.length > 0)
        .slice(0, 3)
    : structuredClone(d.buttons);
  return {
    layout: pick(r.layout, POST_LAYOUTS, d.layout),
    hero: pick(r.hero, ["none", "image", "slideshow"] as const, d.hero),
    buttonsPlacement: pick(r.buttonsPlacement, ["below", "inside"] as const, d.buttonsPlacement),
    buttons,
    checklistStyle: pick(r.checklistStyle, ["checklist", "table"] as const, d.checklistStyle),
    sections: Object.fromEntries(
      POST_SECTIONS.map((s) => [s, typeof rawSections[s] === "boolean" ? rawSections[s] : d.sections[s]]),
    ) as Record<PostSection, boolean>,
    footer: text(r.footer, 120, d.footer),
  };
}

export function parsePostDesigns(raw: unknown): PostDesigns {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    POST_USE_CASES.map((u) => [u, parsePostDesign(r[u], DEFAULT_POST_DESIGNS[u])]),
  ) as PostDesigns;
}
