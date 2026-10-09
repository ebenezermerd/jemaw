import { describe, expect, it } from "vitest";
import { renderPostImage } from "./index.js";

const offline = (async () => {
  throw new Error("offline");
}) as unknown as typeof fetch;

/** Width and height from a PNG's IHDR chunk. */
const size = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe("renderPostImage", () => {
  it("draws a hero at 1280x720", async () => {
    const png = await renderPostImage({ kind: "hero", eyebrow: "This week", badge: "Oct 3 – Oct 9", amount: "2,050", currency: "ETB", subline: "3 expenses" });
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(size(png)).toEqual({ width: 1280, height: 720 });
  });

  it("draws an expense card without the emoji when the CDN is unreachable", async () => {
    const png = await renderPostImage(
      { kind: "expense", title: "Offline lunch", amount: "900", currency: "ETB", payer: "Ebenezer", date: "Oct 8", emoji: "🥨" },
      { fetch: offline },
    );
    expect(size(png)).toEqual({ width: 1080, height: 1080 });
  });
});
