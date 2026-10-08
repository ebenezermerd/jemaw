import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu.js";

// ─── Nav icons ────────────────────────────────────────────────────────────────

function IcoOverview({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="8" rx="2" stroke={c} strokeWidth="1.7" />
      <rect x="11" y="2" width="7" height="4" rx="2" stroke={c} strokeWidth="1.7" />
      <rect x="2" y="12" width="7" height="6" rx="2" stroke={c} strokeWidth="1.7" />
      <rect x="11" y="8" width="7" height="10" rx="2" stroke={c} strokeWidth="1.7" />
    </svg>
  );
}

function IcoUsers({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <circle cx="7.5" cy="6" r="3" stroke={c} strokeWidth="1.7" />
      <path d="M1.5 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14 8a3 3 0 0 1 0-6M18.5 17c0-2.761-1.79-5.11-4.25-5.83" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IcoGroups({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="7" height="7" rx="2" stroke={c} strokeWidth="1.7" />
      <rect x="11" y="3" width="7" height="7" rx="2" stroke={c} strokeWidth="1.7" />
      <rect x="5" y="12" width="10" height="5.5" rx="2" stroke={c} strokeWidth="1.7" />
    </svg>
  );
}

function IcoExpenses({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="4" width="15" height="12" rx="2" stroke={c} strokeWidth="1.7" />
      <path d="M2.5 8h15" stroke={c} strokeWidth="1.7" />
      <path d="M7 12.5h6" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IcoLogs({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M4 5h12M4 9.5h8M4 14h10" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IcoAnnouncements({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M3 7.5C3 6.12 4.12 5 5.5 5H15c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H9l-4 3v-3H5.5C4.12 13 3 11.88 3 10.5v-3z" stroke={c} strokeWidth="1.7" />
    </svg>
  );
}

function IcoSettings({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.7" />
      <path
        d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
        stroke={c}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Three-circle logo mark ────────────────────────────────────────────────────

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        background: "rgba(255,255,255,.08)",
        border: "1px solid rgba(255,255,255,.18)",
        position: "relative",
        overflow: "hidden",
        flex: "none",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: size * 0.14 }}>
        <circle cx="50" cy="40" r="24" fill="#fff" opacity={0.94} style={{ mixBlendMode: "screen" }} />
        <circle cx="36" cy="63" r="24" fill="#E5DFF5" opacity={0.92} style={{ mixBlendMode: "screen" }} />
        <circle cx="64" cy="63" r="24" fill="#C8BFEF" opacity={0.9} style={{ mixBlendMode: "screen" }} />
      </svg>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_MANAGE = [
  { to: "/", label: "Overview", end: true, Icon: IcoOverview },
  { to: "/users", label: "Users", Icon: IcoUsers },
  { to: "/groups", label: "Groups", Icon: IcoGroups },
  { to: "/expenses", label: "Expenses", Icon: IcoExpenses },
  { to: "/logs", label: "Activity & Logs", Icon: IcoLogs },
  { to: "/announcements", label: "Announcements", Icon: IcoAnnouncements },
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

const SUBTITLES: Record<string, string> = {
  "/": "Platform at a glance",
  "/users": "Manage Telegram users",
  "/groups": "Active group chats",
  "/expenses": "Cross-group expense feed",
  "/logs": "Everything the bot and admins did",
  "/announcements": "Broadcast messages",
  "/settings": "Bot health, AI and switches",
};

// ─── Reusable nav link ────────────────────────────────────────────────────────

function NavItem({
  to,
  label,
  end,
  Icon,
}: {
  to: string;
  label: string;
  end?: boolean;
  Icon: React.ComponentType<{ active: boolean }>;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="jx-navitem"
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 10,
        fontSize: 13.5,
        fontWeight: 600,
        textDecoration: "none",
        background: isActive ? "rgba(110,89,199,.16)" : "transparent",
        color: isActive ? "var(--text)" : "var(--text-dim)",
        transition: "background .12s",
      })}
    >
      {({ isActive }) => (
        <>
          <Icon active={isActive} />
          {label}
        </>
      )}
    </NavLink>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Detail pages (/groups/:id, /users/:id) take their section's title.
  const section = "/" + (location.pathname.split("/")[1] ?? "");
  const title = TITLES[section] ?? "Jemaw Admin";
  const subtitle = SUBTITLES[section];

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 760, overflow: "hidden" }}>

      {/* Sidebar */}
      <div
        style={{
          width: 244,
          flex: "none",
          background: "var(--sidebar)",
          borderRight: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 14px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 22px" }}>
          <LogoMark size={36} />
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: "-.02em",
                lineHeight: 1,
              }}
            >
              Jemaw
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: ".15em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                marginTop: 2,
              }}
            >
              Admin Console
            </div>
          </div>
        </div>

        {/* Manage section */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "rgba(244,242,251,.28)",
            padding: "2px 10px 7px",
          }}
        >
          Manage
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_MANAGE.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} end={item.end} Icon={item.Icon} />
          ))}
        </nav>

        {/* System section */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "rgba(244,242,251,.28)",
            padding: "18px 10px 7px",
          }}
        >
          System
        </div>
        <NavItem to="/settings" label="Bot & Settings" Icon={IcoSettings} />

        <div style={{ flex: 1 }} />

        <AccountMenu />
      </div>

      {/* Main */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--bg-panel)",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 66,
            flex: "none",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            alignItems: "center",
            padding: "0 28px",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: "-.02em",
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 1 }}>{subtitle}</div>
            )}
          </div>
        </div>

        {/* Content */}
        <div
          className="jx-scroll"
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "24px 26px" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
