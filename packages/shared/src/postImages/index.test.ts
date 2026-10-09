import { describe, expect, it } from "vitest";
import { renderPostImage } from "./index.js";

/** Width and height from a PNG's IHDR chunk. */
const size = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe("renderPostImage", () => {
  it("draws a hero at 1280x720", async () => {
    const png = await renderPostImage({ kind: "hero", eyebrow: "This week", badge: "Oct 3 – Oct 9", amount: "2,050", currency: "ETB", subline: "3 expenses" });
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(size(png)).toEqual({ width: 1280, height: 720 });
  });

  it("draws expense cards in the same landscape frame as the hero", async () => {
    const png = await renderPostImage({ kind: "expense", title: "Groceries for the whole week", amount: "5,000", currency: "ETB", payer: "Tsin", date: "Oct 8", subline: "Expense 1 of 3 this week" });
    expect(size(png)).toEqual({ width: 1280, height: 720 });
  });
});
