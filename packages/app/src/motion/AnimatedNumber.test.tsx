import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AnimatedNumber } from "./AnimatedNumber.js";

describe("AnimatedNumber", () => {
  it("renders the prefix + value glyphs", () => {
    const { container } = render(<AnimatedNumber value="12.50" prefix="€" />);
    expect(container.textContent).toContain("€12.50");
  });

  it("exposes an accessible label for the whole number", () => {
    const { getByLabelText } = render(
      <AnimatedNumber value="48.50" prefix="+€" />,
    );
    expect(getByLabelText("+€48.50")).toBeDefined();
  });
});
