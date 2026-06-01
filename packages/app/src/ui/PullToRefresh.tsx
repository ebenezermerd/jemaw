/**
 * Pull-to-refresh: drag down from the top of the page to trigger `onRefresh`.
 * Shows a "Listening…" / spinner-free line that follows the pull (plan §12.9
 * pull-to-refresh). Touch-based; no-ops where touch isn't available.
 */
import { useRef, useState, type ReactNode } from "react";
import { Loader } from "../motion/Loader.js";

const THRESHOLD = 72; // px pull distance to commit
const MAX = 96;

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    // Only start a pull when the scroll container is already at the top.
    if (window.scrollY > 0 || refreshing) return;
    startY.current = e.touches[0]!.clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const dy = e.touches[0]!.clientY - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band the pull distance.
    setPull(Math.min(MAX, dy * 0.5));
  }

  async function onTouchEnd() {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const progress = Math.min(1, pull / THRESHOLD);
  const label = refreshing
    ? "Refreshing…"
    : pull >= THRESHOLD
      ? "Release to refresh"
      : "Pull to refresh";

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ minHeight: "100%" }}
    >
      {/* branded indicator: the Jemaw loader spins up as you pull */}
      <div
        style={{
          height: pull,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          gap: 6,
          gridAutoRows: "min-content",
          justifyItems: "center",
          transition:
            refreshing || pull === 0
              ? "height var(--dur-base) var(--ease-standard)"
              : "none",
        }}
      >
        <div
          style={{
            opacity: progress,
            transform: refreshing ? "none" : `rotate(${progress * 270}deg) scale(${0.6 + progress * 0.4})`,
          }}
        >
          <Loader size={28} />
        </div>
        <span
          className="t-caption"
          style={{ color: "var(--text-muted)", opacity: progress }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
