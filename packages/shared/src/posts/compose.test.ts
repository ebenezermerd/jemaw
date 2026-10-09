import { describe, expect, it } from "vitest";
import { composePost } from "./compose.js";
import { DEFAULT_POST_DESIGNS, parsePostDesigns, type PostDesign } from "./designs.js";
import { htmlToRich, richToHtml } from "./rich.js";
import { SAMPLE_POST_DATA } from "./sample.js";

const ctx = { openUrl: "https://t.me/jemawsbot/app?startapp=g1" };
const design = (base: PostDesign, patch: Partial<PostDesign>): PostDesign => ({ ...structuredClone(base), ...patch });
const types = (blocks: { type: string }[] | null) => (blocks ?? []).map((b) => b.type);

describe("composePost", () => {
  it("weekly showcase: hero photo, title, expenses table with a total, buttons below as keyboard rows", () => {
    const post = composePost(SAMPLE_POST_DATA.weekly, DEFAULT_POST_DESIGNS.weekly, ctx);
    expect(types(post.rich).slice(0, 3)).toEqual(["photo", "heading", "paragraph"]);
    expect(post.images).toHaveLength(1);
    expect(post.images[0]!.kind).toBe("hero");
    const table = post.rich!.find((b) => b.type === "table") as { cells: { text?: unknown; colspan?: number }[][] };
    expect(table.cells.at(-1)![0]!.colspan).toBe(3);
    expect(types(post.rich)).not.toContain("buttons");
    expect(post.keyboard[0]![0]).toMatchObject({ text: "Open Jemaw", url: ctx.openUrl, style: "primary" });
    // Copy buttons carry a plain label; Telegram adds its own copy icon.
    expect(post.keyboard[1]![0]).toEqual({ text: "Copy total", copy_text: { text: "2050" } });
  });

  it("weekly showcase: slideshow swipes the hero and one card per expense", () => {
    const post = composePost(SAMPLE_POST_DATA.weekly, design(DEFAULT_POST_DESIGNS.weekly, { hero: "slideshow" }), ctx);
    expect(post.rich![0]).toMatchObject({ type: "slideshow" });
    expect(post.images.map((i) => i.kind)).toEqual(["hero", "expense", "expense", "expense"]);
  });

  it("buttons inside the message become button blocks and leave the keyboard for the fallback only", () => {
    const post = composePost(SAMPLE_POST_DATA.weekly, design(DEFAULT_POST_DESIGNS.weekly, { buttonsPlacement: "inside" }), ctx);
    expect(types(post.rich).filter((t) => t === "buttons")).toHaveLength(2);
    expect(post.buttonsPlacement).toBe("inside");
  });

  it("payments checklist has a checkbox per payback and no quotes", () => {
    const post = composePost(SAMPLE_POST_DATA.ai_payments, DEFAULT_POST_DESIGNS.ai_payments, ctx);
    const list = post.rich!.find((b) => b.type === "list") as { items: { has_checkbox?: boolean }[] };
    expect(list.items).toHaveLength(2);
    expect(list.items.every((i) => i.has_checkbox)).toBe(true);
    expect(types(post.rich)).not.toContain("pullquote");
    expect(types(post.rich)).not.toContain("blockquote");
  });

  it("payments as a table has no header row", () => {
    const post = composePost(SAMPLE_POST_DATA.ai_payments, design(DEFAULT_POST_DESIGNS.ai_payments, { checklistStyle: "table" }), ctx);
    const table = post.rich!.find((b) => b.type === "table") as { cells: { is_header?: boolean }[][] };
    expect(table.cells).toHaveLength(2);
    expect(table.cells.flat().some((c) => c.is_header)).toBe(false);
  });

  it("no post starts with a lab tag line", () => {
    for (const data of Object.values(SAMPLE_POST_DATA)) {
      const post = composePost(data, DEFAULT_POST_DESIGNS[data.useCase], ctx);
      expect(post.html).not.toMatch(/🧪/);
      expect(JSON.stringify(post.rich)).not.toMatch(/🧪/);
    }
  });

  it("release article lists new, improved and fixed with a footer", () => {
    const post = composePost(SAMPLE_POST_DATA.release, DEFAULT_POST_DESIGNS.release, ctx);
    const headings = post.rich!.filter((b) => b.type === "heading").map((b) => (b as { text: string }).text);
    expect(headings).toEqual(["Jemaw gets prettier", "✨ New", "⚡ Improved", "🛠 Fixed"]);
    expect(types(post.rich).slice(-2)).toEqual(["divider", "footer"]);
  });

  it("classic layout sends HTML with a keyboard and a photo when a hero is on", () => {
    const post = composePost(SAMPLE_POST_DATA.weekly, design(DEFAULT_POST_DESIGNS.weekly, { layout: "classic" }), ctx);
    expect(post.rich).toBeNull();
    expect(post.photo?.kind).toBe("hero");
    expect(post.html).toContain("<b>Weekly report</b>");
    expect(post.html).toContain("<pre>");
    expect(post.keyboard).toHaveLength(2);
  });

  it("drops open buttons when there is no link", () => {
    const post = composePost(SAMPLE_POST_DATA.announcement, DEFAULT_POST_DESIGNS.announcement, { openUrl: null });
    expect(post.keyboard).toEqual([]);
  });

  it("report article turns bullet lines into a list under their bold heading", () => {
    const post = composePost(
      { useCase: "ai_report", data: { title: "Open debts", html: "<b>Open debts</b>\n• <b>Pomi</b> → <b>Tsin</b> · 39 ETB", note: null } },
      DEFAULT_POST_DESIGNS.ai_report,
      ctx,
    );
    expect(types(post.rich)).toEqual(["heading", "list"]);
  });
});

describe("rich text", () => {
  it("round-trips the Telegram HTML subset", () => {
    const html = "Spent: <b>2,050 &amp; more</b> by <i>Tsin</i>";
    expect(richToHtml(htmlToRich(html))).toBe(html);
  });
});

describe("parsePostDesigns", () => {
  it("fills missing and off-type values from the defaults", () => {
    const d = parsePostDesigns({ weekly: { layout: "bogus", hero: "slideshow", buttons: [[{ label: "Go", action: "url", url: "javascript:x" }]] } });
    expect(d.weekly.layout).toBe("showcase");
    expect(d.weekly.hero).toBe("slideshow");
    expect(d.weekly.buttons).toEqual([]);
    expect(d.release).toEqual(DEFAULT_POST_DESIGNS.release);
  });
});
