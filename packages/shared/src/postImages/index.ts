/**
 * Branded images for bot posts (hero, expense cards, banners), drawn from
 * live numbers with satori and rasterised with resvg. All share one
 * landscape 1280x720 frame so a slideshow never changes height. Node only: the console
 * and Mini App never import this entry.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { IMAGE_SIZE, type ImageSpec } from "../posts/compose.js";

const FONT_DIR = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
const font = (file: string) => readFileSync(FONT_DIR + file);

let fonts: Parameters<typeof satori>[1]["fonts"] | null = null;
function loadFonts() {
  fonts ??= [
    { name: "Bricolage", data: font("bricolage-grotesque-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Bricolage", data: font("bricolage-grotesque-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "Hanken", data: font("hanken-grotesk-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Hanken", data: font("hanken-grotesk-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "SpaceMono", data: font("space-mono-latin-700-normal.woff"), weight: 700, style: "normal" },
  ];
  return fonts;
}

const LOGO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2C84"/><stop offset=".6" stop-color="#6E59C7"/><stop offset="1" stop-color="#8A78D6"/></linearGradient></defs><rect width="128" height="128" rx="36" fill="url(#g)"/><g transform="translate(19 19) scale(.9)"><circle cx="50" cy="40" r="23" fill="#F2EFFA" opacity=".9"/><circle cx="37" cy="62" r="23" fill="#C8BFEF" opacity=".8"/><circle cx="63" cy="62" r="23" fill="#A99CE3" opacity=".75"/></g></svg>`,
).toString("base64")}`;

const C = {
  bg: "#0b0a11",
  text: "#f4f2fb",
  muted: "rgba(244,242,251,0.62)",
  faint: "rgba(244,242,251,0.45)",
  violet: "#a99ce3",
  violetSoft: "#c8bfef",
};

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, ...children: (Node | string | null)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c != null) },
});
const img = (src: string, size: number): Node => ({ type: "img", props: { src, width: size, height: size, style: { width: size, height: size } } });
const mono = (text: string, size: number, color: string, extra: Record<string, unknown> = {}) =>
  el("div", { fontFamily: "SpaceMono", fontWeight: 700, fontSize: size, letterSpacing: size * 0.12, textTransform: "uppercase", color, ...extra }, text);
const pill = (text: string, color: string, size = 18) =>
  el("div", { padding: `${size * 0.55}px ${size}px`, borderRadius: 999, backgroundColor: `${color}22` }, mono(text, size, color));
const brand = (size: number) =>
  el("div", { alignItems: "center", gap: size * 0.28 }, img(LOGO, size), el("div", { fontFamily: "Bricolage", fontWeight: 700, fontSize: size * 0.55, letterSpacing: -1, color: C.text }, "jemaw"));
const canvas = (w: number, h: number, glow: string, ...children: Node[]) =>
  el(
    "div",
    { width: w, height: h, flexDirection: "column", backgroundColor: C.bg, backgroundImage: glow, color: C.text, fontFamily: "Hanken" },
    ...children,
  );

function hero(s: Extract<ImageSpec, { kind: "hero" }>): Node {
  const { width, height } = IMAGE_SIZE.hero;
  return canvas(
    width,
    height,
    "radial-gradient(circle at 0% 0%, rgba(110,89,199,0.75) 0%, rgba(11,10,17,0) 55%), radial-gradient(circle at 100% 100%, rgba(169,156,227,0.35) 0%, rgba(11,10,17,0) 45%)",
    el(
      "div",
      { flexDirection: "column", padding: "72px 80px", flexGrow: 1 },
      el("div", { alignItems: "center", justifyContent: "space-between" }, brand(64), pill(s.badge, C.violetSoft)),
      el(
        "div",
        { flexDirection: "column", marginTop: "auto" },
        mono(s.eyebrow, 20, C.violet),
        el(
          "div",
          { alignItems: "flex-end", marginTop: 14, fontFamily: "Bricolage", fontWeight: 800, letterSpacing: -4 },
          el("div", { fontSize: 120, lineHeight: 1 }, s.amount),
          el("div", { fontSize: 56, color: C.violet, marginLeft: 20, marginBottom: 10 }, s.currency),
        ),
        el("div", { fontSize: 30, color: C.muted, marginTop: 18 }, s.subline),
      ),
    ),
  );
}

/** One expense, laid out like the hero: its name in the middle, the amount at the foot. */
function expense(s: Extract<ImageSpec, { kind: "expense" }>): Node {
  const { width, height } = IMAGE_SIZE.expense;
  const long = s.title.length > 22;
  return canvas(
    width,
    height,
    "radial-gradient(circle at 0% 0%, rgba(110,89,199,0.6) 0%, rgba(11,10,17,0) 50%), radial-gradient(circle at 100% 100%, rgba(169,156,227,0.3) 0%, rgba(11,10,17,0) 45%)",
    el(
      "div",
      { flexDirection: "column", padding: "72px 80px", flexGrow: 1 },
      el("div", { alignItems: "center", justifyContent: "space-between" }, brand(64), pill(s.date, C.violetSoft)),
      el(
        "div",
        { flexGrow: 1, alignItems: "center" },
        el(
          "div",
          { fontFamily: "Bricolage", fontWeight: 800, fontSize: long ? 64 : 84, letterSpacing: -3, lineHeight: 1.05, maxWidth: 1000 },
          s.title.slice(0, 60),
        ),
      ),
      el(
        "div",
        { flexDirection: "column" },
        mono(`Paid by ${s.payer}`, 20, C.violet),
        el(
          "div",
          { alignItems: "flex-end", marginTop: 14, fontFamily: "Bricolage", fontWeight: 800, letterSpacing: -4 },
          el("div", { fontSize: 120, lineHeight: 1 }, s.amount),
          el("div", { fontSize: 56, color: C.violet, marginLeft: 20, marginBottom: 10 }, s.currency),
        ),
        el("div", { fontSize: 30, color: C.muted, marginTop: 18 }, s.subline),
      ),
    ),
  );
}

function banner(s: Extract<ImageSpec, { kind: "banner" }>): Node {
  const { width, height } = IMAGE_SIZE.banner;
  return canvas(
    width,
    height,
    "radial-gradient(circle at 0% 0%, rgba(110,89,199,0.75) 0%, rgba(11,10,17,0) 55%), radial-gradient(circle at 100% 100%, rgba(142,230,176,0.25) 0%, rgba(11,10,17,0) 45%)",
    el(
      "div",
      { flexDirection: "column", padding: "72px 80px", flexGrow: 1 },
      brand(64),
      el(
        "div",
        { flexDirection: "column", marginTop: "auto" },
        mono(s.eyebrow, 20, C.violet),
        el("div", { fontFamily: "Bricolage", fontWeight: 800, fontSize: s.title.length > 28 ? 72 : 96, letterSpacing: -3, lineHeight: 1.02, marginTop: 16 }, s.title.slice(0, 70)),
        el("div", { fontSize: 30, color: C.muted, marginTop: 18 }, s.subline),
      ),
    ),
  );
}

// ─── Rendering ───────────────────────────────────────────────────────

const pngCache = new Map<string, Buffer>();
const CACHE_MAX = 64;

/** Render one image spec to PNG. Results are cached by content. */
export async function renderPostImage(spec: ImageSpec): Promise<Buffer> {
  const key = createHash("sha1").update(JSON.stringify(spec)).digest("hex");
  const hit = pngCache.get(key);
  if (hit) return hit;
  const { width, height } = IMAGE_SIZE[spec.kind];
  const tree =
    spec.kind === "hero" ? hero(spec)
    : spec.kind === "banner" ? banner(spec)
    : expense(spec);
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  if (pngCache.size >= CACHE_MAX) pngCache.delete(pngCache.keys().next().value!);
  pngCache.set(key, png);
  return png;
}
