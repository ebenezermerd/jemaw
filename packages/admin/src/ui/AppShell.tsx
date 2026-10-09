import { useCallback, useEffect, useState, type ReactNode } from "react";
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

function IcoDesigns({ active }: { active: boolean }) {
  const c = active ? "var(--text)" : "var(--text-dim)";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="14" rx="3" stroke={c} strokeWidth="1.7" />
      <path d="M3 8h14M8 8v9" stroke={c} strokeWidth="1.7" />
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

interface NavEntry {
  to: string;
  label: string;
  desc: string;
  end?: boolean;
  Icon: React.ComponentType<{ active: boolean }>;
}

const NAV: { label: string; items: NavEntry[] }[] = [
  {
    label: "Manage",
    items: [
      { to: "/", label: "Overview", desc: "Platform at a glance", end: true, Icon: IcoOverview },
      { to: "/users", label: "Users", desc: "Telegram users and access", Icon: IcoUsers },
      { to: "/groups", label: "Groups", desc: "Group chats, access and AI", Icon: IcoGroups },
      { to: "/expenses", label: "Expenses", desc: "Cross-group expense feed", Icon: IcoExpenses },
      { to: "/logs", label: "Activity & Logs", desc: "What the bot and admins did", Icon: IcoLogs },
      { to: "/announcements", label: "Announcements", desc: "Broadcast to groups or people", Icon: IcoAnnouncements },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Bot & Settings", desc: "Health, AI usage and switches", Icon: IcoSettings },
      { to: "/designs", label: "Message designs", desc: "How reports, AI answers and releases look", Icon: IcoDesigns },
    ],
  },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.label])));
const SUBTITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.desc])));

const COLLAPSE_KEY = "jemaw-admin.sidebar-collapsed";
const EXPANDED_W = 264;
const COLLAPSED_W = 72;

/** Sidebar open/collapsed, remembered per browser; Ctrl/⌘+B toggles it. */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage blocked: still toggles for this visit
      }
      return !c;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return [collapsed, toggle];
}

// ─── Reusable nav link ────────────────────────────────────────────────────────

function NavItem({ item, collapsed }: { item: NavEntry; collapsed: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={collapsed ? item.label : undefined}
      className="jx-navitem"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={({ isActive }) => ({
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : undefined,
        gap: 11,
        padding: collapsed ? "10px 0" : "8px 11px",
        borderRadius: 10,
        textDecoration: "none",
        background: isActive ? "rgba(110,89,199,.16)" : "transparent",
        boxShadow: isActive ? "inset 2px 0 0 var(--accent-soft)" : undefined,
        color: isActive ? "var(--text)" : "var(--text-dim)",
        transition: "background .12s",
      })}
    >
      {({ isActive }) => (
        <>
          <span style={{ display: "flex", flex: "none", width: 18, justifyContent: "center" }}>
            <item.Icon active={isActive} />
          </span>
          {!collapsed && (
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: "18px", color: isActive ? "var(--text)" : "rgba(244,242,251,.82)" }}>
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  lineHeight: "14px",
                  color: "var(--text-dim)",
                  opacity: 0.75,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.desc}
              </span>
            </span>
          )}
          {collapsed && hover && (
            <span
              role="tooltip"
              style={{
                position: "absolute",
                left: "calc(100% + 12px)",
                top: "50%",
                transform: "translateY(-50%)",
                background: "#1E1C2A",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 9,
                padding: "6px 10px",
                whiteSpace: "nowrap",
                zIndex: 80,
                boxShadow: "0 12px 30px -10px rgba(0,0,0,.6)",
                pointerEvents: "none",
              }}
            >
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{item.label}</span>
              <span style={{ display: "block", fontSize: 10.5, color: "var(--text-dim)" }}>{item.desc}</span>
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl/⌘ B)`}
      className="jx-navitem"
      style={{
        width: 30,
        height: 30,
        flex: "none",
        display: "grid",
        placeItems: "center",
        borderRadius: 8,
        border: "1px solid var(--hairline-2)",
        background: "transparent",
        color: "var(--text-dim)",
        cursor: "pointer",
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M9 4v16" />
        <path d={collapsed ? "M13 10l2 2-2 2" : "M16 10l-2 2 2 2"} />
      </svg>
    </button>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Detail pages (/groups/:id, /users/:id) take their section's title.
  const section = "/" + (location.pathname.split("/")[1] ?? "");
  const title = TITLES[section] ?? "Jemaw Admin";
  const subtitle = SUBTITLES[section];
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 760, overflow: "hidden" }}>

      {/* Sidebar */}
      <aside
        data-collapsed={collapsed}
        style={{
          width: collapsed ? COLLAPSED_W : EXPANDED_W,
          flex: "none",
          background: "var(--sidebar)",
          borderRight: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          padding: collapsed ? "18px 10px" : "18px 14px",
          transition: "width .18s ease, padding .18s ease",
        }}
      >
        {/* Logo + collapse */}
        <div
          style={{
            display: "flex",
            flexDirection: collapsed ? "column" : "row",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "2px 0 16px" : "2px 4px 18px 8px",
            borderBottom: "1px solid var(--hairline)",
            marginBottom: 12,
          }}
        >
          <LogoMark size={collapsed ? 34 : 36} />
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, letterSpacing: "-.02em", lineHeight: 1 }}>
                Jemaw
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: ".15em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  marginTop: 3,
                }}
              >
                Admin Console
              </div>
            </div>
          )}
          <CollapseButton collapsed={collapsed} onClick={toggle} />
        </div>

        <nav aria-label="Main navigation" className="jx-scroll" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: collapsed ? "visible" : "auto", flex: 1, minHeight: 0 }}>
          {NAV.map((group, gi) => (
            <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {collapsed ? (
                gi > 0 && <div style={{ height: 1, background: "var(--hairline)", margin: "10px 8px" }} />
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "rgba(244,242,251,.28)",
                    padding: gi === 0 ? "4px 11px 7px" : "16px 11px 7px",
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        <AccountMenu collapsed={collapsed} />
      </aside>

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
