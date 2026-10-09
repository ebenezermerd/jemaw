/**
 * What members see when the Jemaw team limits their group: a branded
 * suspended screen, or a notice when AI is paused or today's AI allowance is
 * used up.
 */
import type { GroupAccessDto } from "@jemaw/shared/types";
import { Splash } from "./Splash.js";

const fmtUntil = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SuspendedScreen({ access, groupName }: { access: GroupAccessDto; groupName?: string }) {
  return (
    <Splash loading={false} subtitle="paused by the Jemaw team" hint="Your expenses and balances are safe and will be here when the group is back.">
      <div
        role="status"
        style={{
          position: "relative",
          width: "min(320px, calc(100vw - 48px))",
          padding: "18px 20px",
          borderRadius: 20,
          background: "rgba(22,21,31,.82)",
          border: "1px solid rgba(169,156,227,.22)",
          boxShadow: "0 24px 60px -24px rgba(110,89,199,.6)",
          textAlign: "center",
          display: "grid",
          gap: 8,
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#F4F2FB" }}>
          {groupName ? `${groupName} is on pause` : "This group is on pause"}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(244,242,251,.62)" }}>
          {access.reason ?? "Jemaw is taking a break in this group for now."}
        </div>
        <div style={{ fontSize: 12, color: "#A99CE3" }}>
          {access.until ? `Back ${fmtUntil(access.until)}` : "Back when the Jemaw team lifts it"}
        </div>
      </div>
    </Splash>
  );
}

/** Notice for the home screen when the group's AI is paused or out for today. */
export function AiAccessNotice({ access }: { access: GroupAccessDto | undefined }) {
  if (!access) return null;
  const limitHit = access.status === "active" && access.aiDailyLimit != null && access.aiCallsToday >= access.aiDailyLimit;
  if (access.status !== "ai_paused" && !limitHit) return null;
  const text = limitHit
    ? "This group used today's AI allowance. Scans and AI replies are back at midnight UTC. Everything else works."
    : `AI is paused for this group${access.until ? ` until ${fmtUntil(access.until)}` : ""}. Adding, settling and balances still work.${access.reason ? ` ${access.reason}` : ""}`;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: "var(--r-lg)",
        background: "var(--accent-soft)",
        border: "1px solid rgba(169,156,227,.25)",
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: "20px" }}>⏸</span>
      <span className="t-caption" style={{ color: "var(--text)", lineHeight: 1.45 }}>
        {text}
      </span>
    </div>
  );
}
