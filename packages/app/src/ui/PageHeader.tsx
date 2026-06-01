/**
 * Header for internal pages (forms, details, settings): a ‹ back badge on the
 * far left, the page title right-aligned on the same row. Context-aware back —
 * navigate(-1) returns to wherever the page was opened from (e.g. settle form →
 * the settle list). Also drives Telegram's native BackButton so the OS/edge
 * back gesture navigates in-app instead of minimizing.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bindTelegramBack } from "../telegram.js";

export function PageHeader({
  title,
  /** where to go if there's no in-app history (deep link / refresh) */
  fallback = "/",
}: {
  title: string;
  fallback?: string;
}) {
  const nav = useNavigate();

  function goBack() {
    // Prefer real history; fall back to a sensible route on a cold open.
    if (window.history.length > 1) nav(-1);
    else nav(fallback);
  }

  // Wire Telegram's BackButton (and thus the OS back gesture) to in-app back.
  useEffect(() => {
    const cleanup = bindTelegramBack(goBack);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        // Same top safe-area spacing as the main tab pages, so the back badge +
        // title clear Telegram's top controls / notch in full-screen.
        padding: "calc(12px + env(safe-area-inset-top)) 16px 12px",
      }}
    >
      <button
        aria-label="Back"
        onClick={goBack}
        style={{
          width: 38,
          height: 38,
          borderRadius: "var(--r-full)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          cursor: "pointer",
          fontSize: 20,
          lineHeight: 1,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          transition: "transform var(--dur-instant) var(--ease-standard)",
        }}
        onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.9)")}
        onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ‹
      </button>
      <h1 className="t-screen-title" style={{ margin: 0, textAlign: "right" }}>
        {title}
      </h1>
    </header>
  );
}
