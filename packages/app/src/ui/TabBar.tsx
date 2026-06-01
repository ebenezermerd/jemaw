import { NavLink, useNavigate } from "react-router-dom";
import { useSuggestions } from "../lib/hooks.js";

// Two tabs on each side of the raised center "+" FAB.
const LEFT = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/balances", label: "Balances", icon: "≡" },
];
const RIGHT = [
  { to: "/settle", label: "Settle", icon: "⇄" },
  { to: "/history", label: "History", icon: "↻" },
];

export function TabBar() {
  const nav = useNavigate();
  const suggestions = useSuggestions();
  const count = suggestions.data?.suggestions.length ?? 0;

  return (
    <nav
      style={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        alignItems: "flex-end",
        padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      {LEFT.map((t) => (
        <Tab key={t.to} {...t} badge={t.to === "/" ? count : 0} />
      ))}

      {/* Center raised FAB → Add */}
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <button
          aria-label="Add expense"
          onClick={() => nav("/add")}
          style={{
            width: 58,
            height: 58,
            marginTop: -36,
            borderRadius: "var(--r-full)",
            border: "4px solid var(--bg)",
            background: "var(--accent)",
            color: "#0B0B0C",
            fontSize: 30,
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 6px 18px color-mix(in srgb, var(--accent) 45%, transparent)",
            transition: "transform var(--dur-instant) var(--ease-standard)",
          }}
          onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          +
        </button>
      </div>

      {RIGHT.map((t) => (
        <Tab key={t.to} {...t} badge={0} />
      ))}
    </nav>
  );
}

function Tab({
  to,
  label,
  icon,
  badge,
}: {
  to: string;
  label: string;
  icon: string;
  badge: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      style={({ isActive }) => ({
        position: "relative",
        flex: 1,
        display: "grid",
        placeItems: "center",
        gap: 2,
        padding: "6px 0",
        borderRadius: "var(--r-md)",
        textDecoration: "none",
        color: isActive ? "var(--accent)" : "var(--text-muted)",
        background: isActive ? "var(--accent-soft)" : "transparent",
        transition: "background var(--dur-fast), color var(--dur-fast)",
      })}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span className="t-caption">{label}</span>
      {badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: "24%",
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: "var(--r-full)",
            background: "var(--accent)",
            color: "#0B0B0C",
            fontSize: 10,
            fontWeight: 600,
            display: "grid",
            placeItems: "center",
          }}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
}
