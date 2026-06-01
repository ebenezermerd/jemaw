/**
 * Opening splash — a full-screen gradient with the Jemaw wordmark and the
 * branded loader. Shown while the group context loads, and as the no-context
 * landing. Aesthetic, on-brand, calm.
 */
import { Loader } from "../motion/Loader.js";

export function Splash({
  title = "Jemaw",
  subtitle = "your group's quiet bookkeeper",
  hint,
}: {
  title?: string;
  subtitle?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--accent) 30%, var(--bg)) 0%, var(--bg) 60%), var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* floating accent orbs for depth */}
      <div aria-hidden style={orb(-80, -60, 220, 0.18)} />
      <div aria-hidden style={orb(120, 240, 160, 0.12)} />

      <div
        style={{
          position: "relative",
          display: "grid",
          justifyItems: "center",
          gap: 18,
          textAlign: "center",
          padding: 24,
        }}
      >
        <span
          className="t-display"
          style={{
            background:
              "linear-gradient(120deg, var(--text) 0%, var(--accent) 120%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            letterSpacing: "-0.03em",
          }}
        >
          {title}
        </span>
        <span className="t-body" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </span>
        <div style={{ marginTop: 12 }}>
          <Loader size={40} />
        </div>
        {hint && (
          <span className="t-caption" style={{ color: "var(--text-faint)", maxWidth: 260 }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

function orb(
  top: number,
  left: number,
  size: number,
  opacity: number,
): React.CSSProperties {
  return {
    position: "absolute",
    top,
    left,
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--accent)",
    filter: "blur(60px)",
    opacity,
    pointerEvents: "none",
  };
}
