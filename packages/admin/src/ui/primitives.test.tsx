import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill, Card } from "./primitives.js";

describe("StatusPill", () => {
  it("renders the status label", () => {
    render(<StatusPill status="active" />);
    expect(screen.getByText("active")).toBeTruthy();
  });
});

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeTruthy();
  });
});
