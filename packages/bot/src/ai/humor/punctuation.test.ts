import { describe, it, expect } from "vitest";
import { cleanReplyPunctuation } from "./punctuation.js";

describe("cleanReplyPunctuation", () => {
  it("turns em and en dashes between words into commas", () => {
    expect(cleanReplyPunctuation("Books are clear — nothing pending.")).toBe(
      "Books are clear, nothing pending.",
    );
    expect(cleanReplyPunctuation("Oh Ebenezer—our titan—you did it")).toBe(
      "Oh Ebenezer, our titan, you did it",
    );
    expect(cleanReplyPunctuation("calm – for now")).toBe("calm, for now");
  });

  it("turns semicolons into commas", () => {
    expect(cleanReplyPunctuation("All square, Ebenezer; the group is calm.")).toBe(
      "All square, Ebenezer, the group is calm.",
    );
  });

  it("never leaves doubled or dangling commas", () => {
    expect(cleanReplyPunctuation("Wait, — what?")).toBe("Wait, what?");
    expect(cleanReplyPunctuation("Pay up —")).toBe("Pay up");
    expect(cleanReplyPunctuation("— Jemaw")).toBe("Jemaw");
  });

  it("keeps hyphenated words and number ranges alone", () => {
    expect(cleanReplyPunctuation("a well-known ledger-ghost owes 5-10")).toBe(
      "a well-known ledger-ghost owes 5-10",
    );
  });
});

describe("cleanReplyPunctuation with numbers", () => {
  it("keeps thousands separators intact", () => {
    expect(cleanReplyPunctuation("Hana fronted 1,200 ETB; Sami owes 43,140.66")).toBe(
      "Hana paid 1,200 ETB, Sami owes 43,140.66",
    );
  });
});

describe("cleanReplyPunctuation wording", () => {
  it("says paid instead of fronted", () => {
    expect(cleanReplyPunctuation("Fronted again? Tsin keeps fronting and has fronted 900")).toBe(
      "Paid again? Tsin keeps paying and has paid 900",
    );
  });
});
