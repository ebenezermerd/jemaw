import { NavLink } from "react-router-dom";
import { useSuggestions } from "../lib/hooks.js";

const TABS = [
  { to: "/suggestions", label: "Suggestions", icon: "✦" },
  { to: "/balances", label: "Balances", icon: "≡" },
  { to: "/settle", label: "Settle", icon: "⇄" },
  { to: "/history", label: "History", icon: "↻" },
];

export function TabBar() {
  const suggestions = useSuggestions();
  const count = suggestions.data?.suggestions.length ?? 0;

  return (
    <nav
      style={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        gap: 4,
        padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
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
          <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
          <span className="t-caption">{t.label}</span>
          {t.to === "/suggestions" && count > 0 && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: "26%",
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
              {count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
