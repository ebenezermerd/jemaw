import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.js";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/users", label: "Users" },
  { to: "/groups", label: "Groups" },
  { to: "/expenses", label: "Expenses" },
  { to: "/logs", label: "Activity & Logs" },
  { to: "/announcements", label: "Announcements" },
];

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/users": "Users",
  "/groups": "Groups",
  "/expenses": "Expenses",
  "/logs": "Activity & Logs",
  "/announcements": "Announcements",
  "/settings": "Bot & Settings",
};

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 24px" }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: "linear-gradient(150deg,#3B2C84,#6E59C7 65%,#8A78D6)",
        }}
      />
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, letterSpacing: "-.02em", lineHeight: 1 }}>
          Jemaw
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Admin
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title = TITLES[location.pathname] ?? "Jemaw Admin";

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 760, overflow: "hidden" }}>
      {/* Sidebar */}
      <div
        style={{
          width: 248,
          flex: "none",
          background: "var(--sidebar)",
          borderRight: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          padding: "22px 16px",
        }}
      >
        <Logo />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(244,242,251,.32)", padding: "6px 10px 8px" }}>
          Manage
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="jx-navitem"
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 12px",
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                background: isActive ? "rgba(110,89,199,.16)" : "transparent",
                color: isActive ? "var(--text)" : "var(--text-dim)",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(244,242,251,.32)", padding: "22px 10px 8px" }}>
          System
        </div>
        <NavLink
          to="/settings"
          className="jx-navitem"
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 12px",
            borderRadius: 11,
            fontSize: 14,
            fontWeight: 600,
            background: isActive ? "rgba(110,89,199,.16)" : "transparent",
            color: isActive ? "var(--text)" : "var(--text-dim)",
          })}
        >
          Bot &amp; Settings
        </NavLink>

        {/* Bot status */}
        <div
          style={{
            marginTop: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            padding: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 0 3px rgba(45,212,167,.18)" }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>Bot online</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
            @JemawBot · webhook healthy
          </div>
        </div>

        {/* Admin profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12, padding: "8px 6px" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(140deg,#6E59C7,#A99CE3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {(user?.email ?? "A").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email ?? "Admin"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Admin</div>
          </div>
          <button
            onClick={() => void logout()}
            title="Sign out"
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 13 }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg-panel)" }}>
        <div style={{ height: 70, flex: "none", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 18, padding: "0 28px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, letterSpacing: "-.01em" }}>
            {title}
          </div>
        </div>
        <div className="jx-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "26px 28px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
