import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { ToastProvider, notifyToast, useToast } from "./Toast.js";

function Trigger({ message }: { message: string }) {
  const toast = useToast();
  return <button onClick={() => toast.show(message, "success")}>fire</button>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("shows a toast fired through the hook", () => {
    const { container, getByText } = render(
      <ToastProvider>
        <Trigger message="Member removed." />
      </ToastProvider>,
    );
    act(() => {
      getByText("fire").click();
    });
    expect(container.textContent).toContain("Member removed.");
  });

  it("shows a toast fired from outside React via notifyToast", () => {
    const { container } = render(<ToastProvider>{null}</ToastProvider>);
    act(() => {
      notifyToast("request failed", "error");
    });
    expect(container.textContent).toContain("request failed");
  });

  it("auto dismisses after the timeout", async () => {
    vi.useFakeTimers();
    const { container } = render(<ToastProvider>{null}</ToastProvider>);
    act(() => {
      notifyToast("temporary", "info");
    });
    expect(container.textContent).toContain("temporary");
    // Fire the dismiss timer, then let the exit animation finish on real time.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(container.textContent).not.toContain("temporary"),
    );
  });
});
