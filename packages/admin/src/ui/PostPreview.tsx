/**
 * A Telegram-style preview of a composed post: the message bubble with its
 * rich blocks (or classic HTML), generated images, and keyboard rows. It
 * re-renders from the composer on every edit; only images hit the API.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ComposedPost, ImageSpec, KeyboardButton, RichBlock, RichText } from "@jemaw/shared/posts";
import { api } from "../lib/api.js";
import { Skeleton } from "./Loader.js";

const TG = {
  chat: "#0e1621",
  bubble: "#182533",
  text: "#f5f5f5",
  dim: "rgba(245,245,245,.6)",
  link: "#6ab3f3",
  line: "rgba(255,255,255,.12)",
  stripe: "rgba(255,255,255,.04)",
  key: "rgba(43,82,120,.55)",
};
const BUTTON_BG: Record<NonNullable<KeyboardButton["style"]> | "default", string> = {
  default: TG.key,
  primary: "#3390ec",
  success: "#31a24c",
  danger: "#e0473f",
};

function PostImage({ spec, radius = 0 }: { spec: ImageSpec; radius?: number }) {
  const { data, isError } = useQuery({
    queryKey: ["post-image", spec],
    queryFn: async () => URL.createObjectURL(await api.blob("/api/admin/designs/image", { spec })),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const ratio = spec.kind === "expense" ? "1 / 1" : "16 / 9";
  if (!data) {
    return isError ? (
      <div style={{ aspectRatio: ratio, background: "#22303f", display: "grid", placeItems: "center", color: TG.dim, fontSize: 12, borderRadius: radius }}>
        Image unavailable
      </div>
    ) : (
      <div style={{ aspectRatio: ratio, borderRadius: radius, overflow: "hidden" }}>
        <Skeleton radius={0} style={{ height: "100%" }} />
      </div>
    );
  }
  return <img src={data} alt="" style={{ display: "block", width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: radius }} />;
}

function Text({ t }: { t: RichText }): ReactNode {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((x, i) => <Text key={i} t={x} />);
  const inner = <Text t={t.text} />;
  switch (t.type) {
    case "bold":
      return <b>{inner}</b>;
    case "italic":
      return <i>{inner}</i>;
    case "underline":
      return <u>{inner}</u>;
    case "strikethrough":
      return <s>{inner}</s>;
    case "code":
      return <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>{inner}</code>;
    case "marked":
      return <mark style={{ background: "rgba(255,214,10,.35)", color: "inherit", borderRadius: 3, padding: "0 2px" }}>{inner}</mark>;
    case "url":
      return <a href={t.url} target="_blank" rel="noreferrer" style={{ color: TG.link }}>{inner}</a>;
  }
}

function Slideshow({ blocks, images }: { blocks: Extract<RichBlock, { type: "photo" }>[]; images: ImageSpec[] }) {
  const [i, setI] = useState(0);
  const at = Math.min(i, blocks.length - 1);
  const spec = images[Number(/^image:(\d+)$/.exec(blocks[at]!.photo.media)?.[1])];
  const arrow = (dir: -1 | 1): CSSProperties => ({
    position: "absolute",
    top: "50%",
    [dir < 0 ? "left" : "right"]: 8,
    transform: "translateY(-50%)",
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,.45)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 16,
  });
  return (
    <div style={{ position: "relative" }} aria-label="Slideshow">
      {spec && <PostImage spec={spec} />}
      {at > 0 && <button aria-label="Previous slide" style={arrow(-1)} onClick={() => setI(at - 1)}>‹</button>}
      {at < blocks.length - 1 && <button aria-label="Next slide" style={arrow(1)} onClick={() => setI(at + 1)}>›</button>}
      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
        {blocks.map((_, k) => (
          <span key={k} style={{ width: 6, height: 6, borderRadius: "50%", background: k === at ? "#fff" : "rgba(255,255,255,.4)" }} />
        ))}
      </div>
    </div>
  );
}

const HEADING_SIZE = [0, 22, 19, 17, 15.5, 14.5, 14];

function Block({ b, images }: { b: RichBlock; images: ImageSpec[] }): ReactNode {
  const pad: CSSProperties = { padding: "0 12px" };
  switch (b.type) {
    case "photo": {
      const spec = images[Number(/^image:(\d+)$/.exec(b.photo.media)?.[1])];
      return spec ? <PostImage spec={spec} /> : null;
    }
    case "slideshow":
      return <Slideshow blocks={b.blocks} images={images} />;
    case "heading":
      return <div style={{ ...pad, fontSize: HEADING_SIZE[b.size] ?? 15, fontWeight: 700, lineHeight: 1.25 }}><Text t={b.text} /></div>;
    case "paragraph":
      return <div style={{ ...pad, lineHeight: 1.45 }}><Text t={b.text} /></div>;
    case "footer":
      return <div style={{ ...pad, fontSize: 12, color: TG.dim }}><Text t={b.text} /></div>;
    case "divider":
      return <div style={{ margin: "0 12px", borderTop: `1px solid ${TG.line}` }} />;
    case "list":
      return (
        <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 6 }}>
          {b.items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {item.has_checkbox ? (
                <span
                  aria-label={item.is_checked ? "checked" : "unchecked"}
                  style={{ width: 16, height: 16, flex: "none", marginTop: 2, borderRadius: 4, border: `1.5px solid ${item.is_checked ? TG.link : TG.dim}`, background: item.is_checked ? TG.link : "transparent", color: "#fff", fontSize: 11, display: "grid", placeItems: "center" }}
                >
                  {item.is_checked ? "✓" : ""}
                </span>
              ) : (
                <span style={{ color: TG.dim }}>•</span>
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                {item.blocks.map((x, k) => <Inner key={k} b={x} images={images} />)}
              </div>
            </div>
          ))}
        </div>
      );
    case "blockquote":
      return (
        <div style={{ margin: "0 12px", padding: "6px 10px", borderLeft: `3px solid ${TG.link}`, background: "rgba(106,179,243,.08)", borderRadius: 6 }}>
          {b.blocks.map((x, k) => <Inner key={k} b={x} images={images} />)}
        </div>
      );
    case "expandable_blockquote":
      return <Expandable text={b.text} credit={b.credit} />;
    case "table":
      return (
        <div style={{ ...pad, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <tbody>
              {b.cells.map((row, r) => (
                <tr key={r} style={{ background: b.is_striped && r % 2 === 1 ? TG.stripe : "transparent" }}>
                  {row.map((c, k) => {
                    const Tag = c.is_header ? "th" : "td";
                    return (
                      <Tag
                        key={k}
                        colSpan={c.colspan}
                        style={{
                          textAlign: c.align,
                          padding: b.is_compact ? "4px 6px" : "7px 9px",
                          border: b.is_bordered ? `1px solid ${TG.line}` : "none",
                          borderBottom: `1px solid ${TG.line}`,
                          fontWeight: c.is_header ? 700 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.text != null && <Text t={c.text} />}
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "details":
      return (
        <details open={b.is_open} style={{ margin: "0 12px", border: `1px solid ${TG.line}`, borderRadius: 8, padding: "6px 10px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}><Text t={b.summary} /></summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, marginLeft: -12, marginRight: -12 }}>
            {b.blocks.map((x, k) => <Block key={k} b={x} images={images} />)}
          </div>
        </details>
      );
    case "buttons":
      return (
        <div style={{ ...pad, display: "flex", gap: 6, justifyContent: b.align === "left" ? "flex-start" : b.align === "right" ? "flex-end" : "center", flexWrap: "wrap" }}>
          {b.buttons.map((x, i) => (
            <span key={i} style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${x.style ? BUTTON_BG[x.style] : TG.link}`, color: x.style ? "#fff" : TG.link, background: x.style ? BUTTON_BG[x.style] : "transparent", fontSize: 13, fontWeight: 600 }}>
              {x.text}
            </span>
          ))}
        </div>
      );
  }
}

/** Blocks inside a list item or quote sit flush, without the bubble's side padding. */
function Inner({ b, images }: { b: RichBlock; images: ImageSpec[] }) {
  return <div style={{ margin: "0 -12px" }}><Block b={b} images={images} /></div>;
}

function Expandable({ text, credit }: { text: RichText; credit?: RichText }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      style={{ margin: "0 12px", textAlign: "left", color: TG.text, font: "inherit", cursor: "pointer", padding: "6px 10px", borderLeft: `3px solid ${TG.link}`, background: "rgba(106,179,243,.08)", border: "none", borderRadius: 6 }}
    >
      <div style={{ display: "-webkit-box", WebkitLineClamp: open ? "unset" : 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.45 }}>
        <Text t={text} />
      </div>
      {credit && <div style={{ fontSize: 12, color: TG.dim, marginTop: 4 }}>— <Text t={credit} /></div>}
    </button>
  );
}

function Keyboard({ rows }: { rows: KeyboardButton[][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 4 }}>
          {row.map((b, i) => (
            <div
              key={i}
              title={b.url ?? (b.copy_text ? `Copies ${b.copy_text.text}` : undefined)}
              style={{ flex: 1, position: "relative", padding: "9px 10px", borderRadius: 10, background: BUTTON_BG[b.style ?? "default"], color: "#fff", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}
            >
              {b.text}
              <span aria-hidden style={{ position: "absolute", top: 4, right: 6, fontSize: 10, opacity: 0.85 }}>
                {b.copy_text ? "⧉" : b.url ? "↗" : ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PostPreview({ post }: { post: ComposedPost }) {
  const keyboardBelow = post.rich == null || post.buttonsPlacement === "below";
  return (
    <div style={{ background: TG.chat, borderRadius: 14, padding: "18px 14px", minHeight: 360, backgroundImage: "radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      <div data-testid="post-preview" style={{ maxWidth: 400, color: TG.text, fontSize: 14, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ background: TG.bubble, borderRadius: "14px 14px 14px 4px", overflow: "hidden", paddingBottom: 10 }}>
          {post.rich ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {post.rich.map((b, i) => {
                const media = b.type === "photo" || b.type === "slideshow";
                // Media at the very top runs edge to edge, like Telegram.
                return (
                  <div key={i} style={media && i === 0 ? { marginBottom: 2 } : i === 0 ? { marginTop: 10 } : undefined}>
                    <Block b={b} images={post.images} />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {post.photo && post.html.length <= 1024 && <PostImage spec={post.photo} />}
              <div
                style={{ padding: "10px 12px 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}
                // The composer escapes every value it puts in this HTML.
                dangerouslySetInnerHTML={{ __html: post.html }}
              />
            </>
          )}
        </div>
        {keyboardBelow && post.keyboard.length > 0 && <Keyboard rows={post.keyboard} />}
      </div>
    </div>
  );
}
