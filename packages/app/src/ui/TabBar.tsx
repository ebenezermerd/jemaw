import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/balances", label: "Balances", icon: "≡" },
  { to: "/history", label: "History", icon: "↻" },
  { to: "/add", label: "Add", icon: "+" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function TabBar() {
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
        </NavLink>
      ))}
    </nav>
  );
}
