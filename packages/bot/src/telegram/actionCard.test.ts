import { describe, it, expect } from "vitest";
import { cardData, parseCardData, renderActionCard, toggleSelection } from "./actionCard.js";

const id = "0f3c9a12-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

describe("action card", () => {
  it("keeps button data short and reads it back", () => {
    for (const op of ["t0", "t7", "all", "ok", "no"]) {
      const data = cardData(id, op);
      expect(data.length).toBeLessThanOrEqual(64);
      expect(parseCardData(data)?.idPrefix).toBe("0f3c9a12");
    }
    expect(parseCardData(cardData(id, "t3"))?.op).toEqual({ kind: "toggle", index: 3 });
    expect(parseCardData("a:zzz:ok")).toBeNull();
  });

  it("shows ticks, select all and a counted Confirm", () => {
    const card = renderActionCard(
      { id, options: [{ id: "e1", label: "Lunch · 300 ETB" }, { id: "e2", label: "Dinner · 166 ETB" }], selected: [0], payload: { multi: true } },
      "Pick what this payment covers:",
    );
    const texts = card.reply_markup.inline_keyboard.flat().map((b) => b.text);
    expect(texts).toEqual(["☑ Lunch · 300 ETB", "☐ Dinner · 166 ETB", "Select all", "Confirm (1)", "Cancel"]);
  });

  it("toggles many or one", () => {
    expect(toggleSelection([0], { kind: "toggle", index: 1 }, 3, true)).toEqual([0, 1]);
    expect(toggleSelection([0, 1], { kind: "toggle", index: 0 }, 3, true)).toEqual([1]);
    expect(toggleSelection([0], { kind: "toggle", index: 2 }, 3, false)).toEqual([2]);
    expect(toggleSelection([0], { kind: "all" }, 3, true)).toEqual([0, 1, 2]);
    expect(toggleSelection([0, 1, 2], { kind: "all" }, 3, true)).toEqual([]);
  });
});
