import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminGroupDetailDto, AdminGroupDto, AdminUserDetailDto, AdminUserDto } from "@jemaw/shared/types";
import { useNavigate, useParams } from "react-router-dom";
import { fmtMoney, fmtNet, scrollAfter, titleCase } from "../lib/format.js";
import { BackLink, fromState, useBackTo } from "../ui/BackLink.js";
import { PhotoFill } from "../ui/Photo.js";
import { Busy, Loader, PageLoader, SkeletonList, SkeletonRows } from "../ui/Loader.js";
import { DEFAULT_PAGE_SIZE, TableFooter } from "../ui/Pager.js";
import { StatusPill, CenteredMessage } from "../ui/primitives.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const GRADIENTS: Record<string, [string, string, string?]> = {
  A: ["#6E59C7", "#A99CE3"],
  B: ["#1C5E4B", "#2DD4A7", "#063226"],
  C: ["#2A5C8E", "#5BA8E0"],
  D: ["#C99A3E", "#E9C36B", "#3a2a08"],
  E: ["#1C5E4B", "#2DD4A7", "#063226"],
  F: ["#6E59C7", "#A99CE3"],
  G: ["#4a3a5a", "#8A78D6"],
  H: ["#2A5C8E", "#5BA8E0"],
  I: ["#6E59C7", "#A99CE3"],
  J: ["#1C5E4B", "#2DC4B0"],
  K: ["#C99A3E", "#E9C36B", "#3a2a08"],
  L: ["#3a3850", "#8E7BE0"],
  M: ["#5a3a4a", "#F2685F"],
  N: ["#6E59C7", "#A99CE3"],
  O: ["#2A5C8E", "#5BA8E0"],
  P: ["#C99A3E", "#E9C36B", "#3a2a08"],
  Q: ["#4a3a5a", "#8A78D6"],
  R: ["#2A5C8E", "#5BA8E0"],
  S: ["#2A5C8E", "#5BA8E0"],
  T: ["#3a3850", "#8E7BE0"],
  U: ["#6E59C7", "#A99CE3"],
  V: ["#1C5E4B", "#2DC4B0"],
  W: ["#C99A3E", "#E9C36B"],
  X: ["#4a3a5a", "#8A78D6"],
  Y: ["#1C5E4B", "#2DD4A7"],
  Z: ["#5a3a4a", "#F2685F"],
};

function getAvatarStyle(name: string): { bg: string; color: string } {
  const key = name[0]?.toUpperCase() ?? "A";
  const g = GRADIENTS[key] ?? ["#6E59C7", "#A99CE3"];
  return { bg: `linear-gradient(140deg,${g[0]},${g[1]})`, color: g[2] ?? "#fff" };
}

// ─── group icon (three-circle mark) ──────────────────────────────────────────

function GroupIcon({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        background: "linear-gradient(150deg,#3B2C84,#6E59C7 65%,#8A78D6)",
        position: "relative",
        overflow: "hidden",
        flex: "none",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: size * 0.17 }}>
        <circle cx="50" cy="40" r="23" fill="#F2EFFA" opacity=".9" style={{ mixBlendMode: "screen" }} />
        <circle cx="37" cy="62" r="23" fill="#C8BFEF" opacity=".9" style={{ mixBlendMode: "screen" }} />
        <circle cx="63" cy="62" r="23" fill="#A99CE3" opacity=".9" style={{ mixBlendMode: "screen" }} />
      </svg>
    </div>
  );
}

// ─── MESSAGE COMPOSE DIALOG ───────────────────────────────────────────────────

function MessageDialog({
  user,
  onClose,
}: {
  user: AdminUserDto;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(`Hi ${user.displayName.split(" ")[0]}!`);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // focus body on mount
  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await api.post("/api/admin/announcements", {
        title: title.trim() || `Message to ${user.displayName}`,
        body: body.trim(),
        audience: "user",
        targetId: user.telegramUserId,
        queue: true,
      });
      await qc.invalidateQueries({ queryKey: ["announcements"] });
      setSent(true);
      setTimeout(onClose, 1400);
    } catch {
      setBusy(false);
    }
  }

  const charCount = body.length;
  const charMax = 4000;

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(7,7,11,.72)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
        }}
      />

      {/* dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 520,
          background: "#16151F",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 20,
          overflow: "hidden",
          zIndex: 1001,
          boxShadow: "0 32px 80px -16px rgba(0,0,0,.7), 0 0 0 1px rgba(110,89,199,.18)",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                position: "relative",
                overflow: "hidden",
                background: getAvatarStyle(user.displayName).bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                color: getAvatarStyle(user.displayName).color,
                flex: "none",
              }}
            >
              {initials(user.displayName)}
            <PhotoFill path={user.photoUrl} />
              <PhotoFill path={user.photoUrl} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Message {user.displayName}</div>
              <div style={{ fontSize: 12, color: "rgba(244,242,251,.45)", marginTop: 1 }}>
                {user.username ? `@${user.username} · ` : ""}Direct via Telegram bot
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(255,255,255,.06)",
              border: "none",
              color: "rgba(244,242,251,.6)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {/* title row */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".05em",
                color: "rgba(244,242,251,.45)",
                marginBottom: 6,
              }}
            >
              TITLE
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              style={{
                width: "100%",
                background: "#252333",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 10,
                padding: "11px 13px",
                fontSize: 14,
                color: "#F4F2FB",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* message composer */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".05em",
                color: "rgba(244,242,251,.45)",
                marginBottom: 6,
              }}
            >
              MESSAGE
            </div>
            <div
              style={{
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 11,
                overflow: "hidden",
              }}
            >
              {/* formatting toolbar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "8px 10px",
                  background: "#1E1C2A",
                  borderBottom: "1px solid rgba(255,255,255,.07)",
                }}
              >
                {[
                  { label: "B", style: { fontWeight: 800 }, title: "Bold", wrap: ["**", "**"] as [string, string] },
                  { label: "i", style: { fontStyle: "italic" }, title: "Italic", wrap: ["_", "_"] as [string, string] },
                  { label: "U", style: { textDecoration: "underline" }, title: "Underline", wrap: ["", ""] as [string, string] },
                ].map((btn) => (
                  <button
                    key={btn.title}
                    title={btn.title}
                    onClick={() => {
                      const ta = textRef.current;
                      if (!ta) return;
                      const start = ta.selectionStart ?? 0;
                      const end = ta.selectionEnd ?? 0;
                      const sel = body.slice(start, end);
                      const next =
                        body.slice(0, start) +
                        btn.wrap[0] +
                        sel +
                        btn.wrap[1] +
                        body.slice(end);
                      setBody(next);
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(start + btn.wrap[0].length, end + btn.wrap[0].length);
                      }, 0);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      color: "rgba(244,242,251,.7)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      ...btn.style,
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
                <span
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(255,255,255,.1)",
                    margin: "0 5px",
                  }}
                />
                {/* token hint */}
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(244,242,251,.4)",
                    marginLeft: "auto",
                  }}
                >
                  {"{name}"} token available
                </span>
              </div>

              {/* textarea */}
              <textarea
                ref={textRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={charMax}
                placeholder={`Write a message to ${user.displayName}…`}
                rows={6}
                style={{
                  width: "100%",
                  padding: 14,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "rgba(244,242,251,.85)",
                  background: "#252333",
                  border: "none",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                textAlign: "right",
                fontSize: 11,
                color: charCount > charMax * 0.9 ? "#E0B23C" : "rgba(244,242,251,.3)",
                marginTop: 4,
              }}
            >
              {charCount}/{charMax}
            </div>
          </div>

          {/* actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(244,242,251,.7)",
                border: "1px solid rgba(255,255,255,.12)",
                background: "none",
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={send}
              disabled={!body.trim() || busy || sent}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: sent ? "#2DD4A7" : "#6E59C7",
                border: "none",
                padding: "10px 22px",
                borderRadius: 10,
                cursor: !body.trim() || busy || sent ? "default" : "pointer",
                opacity: !body.trim() && !sent ? 0.5 : 1,
                boxShadow: sent
                  ? "0 10px 24px -10px rgba(45,212,167,.5)"
                  : "0 10px 24px -10px rgba(110,89,199,.6)",
                transition: "background .2s, box-shadow .2s",
              }}
            >
              {sent ? (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 12 10 18 20 6" />
                  </svg>
                  Sent!
                </>
              ) : busy ? (
                "Sending…"
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11l18-8-8 18-2-7-8-3z" />
                  </svg>
                  Send message
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── ALL GROUPS DROPDOWN ──────────────────────────────────────────────────────

function GroupsDropdown({
  groups,
  selectedGroupId,
  onSelect,
}: {
  groups: AdminGroupDto[];
  selectedGroupId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = groups.find((g) => g.id === selectedGroupId);
  const label = selected ? selected.name : "All groups";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: selectedGroupId ? "#fff" : "rgba(244,242,251,.7)",
          background: selectedGroupId ? "#6E59C7" : "#16151F",
          border: selectedGroupId ? "none" : "1px solid rgba(255,255,255,.1)",
          padding: "9px 13px",
          borderRadius: 9,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={selectedGroupId ? "#fff" : "#A99CE3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="9" r="3" />
          <circle cx="6" cy="14" r="2.2" />
          <circle cx="18" cy="14" r="2.2" />
        </svg>
        {label}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(244,242,251,.5)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 200,
            background: "#1E1C2A",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 12,
            overflow: "hidden",
            zIndex: 100,
            boxShadow: "0 16px 40px -8px rgba(0,0,0,.5)",
          }}
        >
          {/* "All groups" option */}
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: selectedGroupId === null ? 700 : 400,
              color: selectedGroupId === null ? "#A99CE3" : "rgba(244,242,251,.8)",
              background: selectedGroupId === null ? "rgba(110,89,199,.1)" : "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              borderBottom: "1px solid rgba(255,255,255,.06)",
            }}
          >
            All groups
            {selectedGroupId === null && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#A99CE3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
                <polyline points="4 12 10 18 20 6" />
              </svg>
            )}
          </button>

          {/* group rows */}
          {groups.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: "rgba(244,242,251,.4)" }}>
              No groups found
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { onSelect(g.id); setOpen(false); }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: selectedGroupId === g.id ? 700 : 400,
                    color: selectedGroupId === g.id ? "#A99CE3" : "rgba(244,242,251,.8)",
                    background: selectedGroupId === g.id ? "rgba(110,89,199,.1)" : "none",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,.04)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <GroupIcon size={22} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(244,242,251,.35)", flex: "none" }}>
                    {g.memberCount}
                  </span>
                  {selectedGroupId === g.id && (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#A99CE3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 12 10 18 20 6" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── USER DETAIL PAGE ─────────────────────────────────────────────────────────

/** /users/:telegramId — opened from the list or from a group's member row. */
export function UserDetailPage() {
  const { telegramId = "" } = useParams();
  const qc = useQueryClient();
  const back = useBackTo({ path: "/users", label: "All users" });
  const { data, isLoading, error } = useQuery({
    queryKey: ["user", telegramId],
    queryFn: () => api.get<AdminUserDetailDto>(`/api/admin/users/${telegramId}`),
  });
  const toggle = useMutation({
    mutationFn: (u: AdminUserDto) =>
      api.post(`/api/admin/users/${u.telegramUserId}/${u.isActive ? "suspend" : "activate"}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["user", telegramId] });
    },
  });
  if (isLoading) return <div><BackLink to={back} /><PageLoader /></div>;
  if (error || !data) return <div><BackLink to={back} /><CenteredMessage>Could not load this user.</CenteredMessage></div>;
  return (
    <UserDetail
      user={data.user}
      back={<BackLink to={back} />}
      onToggle={() => toggle.mutate(data.user)}
      isPending={toggle.isPending}
    />
  );
}

function UserDetail({
  user,
  back,
  onToggle,
  isPending,
}: {
  user: AdminUserDto;
  back: React.ReactNode;
  onToggle: () => void;
  isPending: boolean;
}) {
  const navigate = useNavigate();
  const [showMessage, setShowMessage] = useState(false);
  const { bg, color } = getAvatarStyle(user.displayName);
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["user", user.telegramUserId],
    queryFn: () => api.get<AdminUserDetailDto>(`/api/admin/users/${user.telegramUserId}`),
  });

  const memberships = detail?.memberships ?? [];
  const activeMemberships = memberships.filter((m) => m.isActive);
  const currencies = new Set(memberships.map((m) => m.currency));
  // Sums only make sense when every group uses the same currency.
  const oneCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  const sum = (pick: (m: (typeof memberships)[number]) => string) =>
    memberships.reduce((acc, m) => acc + Number(pick(m)), 0);
  const totalNet = sum((m) => m.net);
  const expensesPaid = memberships.reduce((acc, m) => acc + m.expenseCount, 0);

  const timeline = (detail?.recentExpenses ?? []).map((e) => ({
    id: e.id,
    dot: e.voided ? "rgba(244,242,251,.3)" : e.kind === "loan" ? "#E0B23C" : "#8A78D6",
    text:
      e.kind === "loan" ? (
        <>
          Lent <b>{fmtMoney(e.amount, e.currency)}</b> to {e.shares[0]?.name ?? "someone"} · {e.groupName}
          {e.voided ? " (voided)" : ""}
        </>
      ) : (
        <>
          Paid <b>{e.description} · {fmtMoney(e.amount, e.currency)}</b> · {e.groupName}
          {e.voided ? " (voided)" : ""}
        </>
      ),
    at: e.occurredAt,
  }));

  return (
    <>
      {showMessage && (
        <MessageDialog user={user} onClose={() => setShowMessage(false)} />
      )}

      <div>
        {back}

        {/* header card */}
        <div
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 18,
            padding: 22,
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              position: "relative",
              overflow: "hidden",
              borderRadius: "50%",
              background: bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 24,
              color,
              flex: "none",
            }}
          >
            {initials(user.displayName)}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-.02em",
                  margin: 0,
                }}
              >
                {titleCase(user.displayName)}
              </h2>
              <StatusPill status={user.status} />
            </div>
            <div style={{ fontSize: 13, color: "rgba(244,242,251,.5)", marginTop: 3 }}>
              {user.isManual ? "Added by hand, no Telegram account · " : user.username ? `@${user.username} · ` : ""}
              {user.isManual ? "" : `ID ${user.telegramUserId}`}
              {user.lastActiveAt ? ` · Last active ${fmtDate(user.lastActiveAt)}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 9 }}>
            <button
              onClick={() => setShowMessage(true)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(244,242,251,.7)",
                border: "1px solid rgba(255,255,255,.12)",
                background: "none",
                padding: "9px 14px",
                borderRadius: 9,
                cursor: "pointer",
              }}
            >
              Message
            </button>
            <button
              onClick={onToggle}
              disabled={isPending}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: user.isActive ? "#F2685F" : "#2DD4A7",
                border: `1px solid ${user.isActive ? "rgba(242,104,95,.3)" : "rgba(45,212,167,.3)"}`,
                background: "transparent",
                padding: "9px 14px",
                borderRadius: 9,
                cursor: isPending ? "default" : "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "Working…" : user.isActive ? "Suspend user" : "Activate user"}
            </button>
          </div>
        </div>

        {/* 4-stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 18 }}>
          {[
            { value: String(activeMemberships.length), label: "Groups" },
            {
              value: detailLoading ? <Loader size={20} /> : oneCurrency ? fmtMoney(sum((m) => m.paid), oneCurrency) : "Mixed currencies",
              label: "Total paid (loans excluded)",
            },
            {
              value: detailLoading ? <Loader size={20} /> : oneCurrency ? fmtNet(totalNet, oneCurrency) : "See groups",
              label: "Net balance",
              accent: !oneCurrency || totalNet === 0 ? undefined : totalNet > 0 ? "#2DD4A7" : "#F0A640",
            },
            { value: detailLoading ? <Loader size={20} /> : String(expensesPaid), label: "Expenses paid for" },
          ].map(({ value, label, accent }) => (
            <div
              key={label}
              style={{
                background: "#16151F",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 22,
                  fontVariantNumeric: "tabular-nums",
                  color: accent ?? "var(--text)",
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: 12, color: "rgba(244,242,251,.5)", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* two-column */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* group memberships */}
          <div
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "15px 20px",
                borderBottom: "1px solid rgba(255,255,255,.07)",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Group memberships
            </div>
            {detailLoading ? (
              <SkeletonList count={3} height={44} />
            ) : memberships.length === 0 ? (
              <div style={{ padding: "16px 20px", fontSize: 13, color: "rgba(244,242,251,.4)" }}>
                Not in any group.
              </div>
            ) : (
              <div className="jx-scroll" style={{ maxHeight: scrollAfter(8, 61), overflowY: "auto" }}>
              {memberships.map((g, i) => (
                <div
                  key={g.memberId}
                  className="jx-row"
                  onClick={() => navigate(`/groups/${g.groupId}`, fromState(`/users/${user.telegramUserId}`, titleCase(user.displayName)))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "13px 20px",
                    borderBottom: i < memberships.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                    cursor: "pointer",
                    opacity: g.isActive ? 1 : 0.5,
                  }}
                >
                  <GroupIcon size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.groupName}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(244,242,251,.45)" }}>
                      {g.isActive ? (g.role === "admin" ? "Admin" : "Member") : "Removed"}
                      {g.displayName !== user.displayName ? ` as ${g.displayName}` : ""} · paid{" "}
                      {fmtMoney(g.paid, g.currency)} over {g.expenseCount}{" "}
                      {g.expenseCount === 1 ? "expense" : "expenses"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: Number(g.net) > 0 ? "#2DD4A7" : Number(g.net) < 0 ? "#F0A640" : "rgba(244,242,251,.55)",
                      fontVariantNumeric: "tabular-nums",
                      flex: "none",
                    }}
                  >
                    {fmtNet(g.net, g.currency)}
                  </span>
                </div>
              ))}
              </div>
            )}
          </div>

          {/* recent activity timeline */}
          <div
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              Recent activity
              {timeline.length > 0 && (
                <span style={{ fontWeight: 500, fontSize: 12, color: "rgba(244,242,251,.45)" }}> · last {timeline.length}</span>
              )}
            </div>
            {detailLoading ? (
              <SkeletonList count={4} height={34} padding={0} />
            ) : timeline.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(244,242,251,.4)" }}>
                Has not paid for anything yet.
              </div>
            ) : (
              <div
                className="jx-scroll"
                data-testid="user-activity"
                style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: scrollAfter(8, 50), overflowY: "auto", paddingRight: 6 }}
              >
                {timeline.map((item, i) => (
                  <div key={item.id} style={{ display: "flex", gap: 11 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: item.dot,
                          flex: "none",
                          marginTop: 3,
                        }}
                      />
                      {i < timeline.length - 1 && (
                        <span
                          style={{
                            flex: 1,
                            width: 2,
                            background: "rgba(255,255,255,.08)",
                            marginTop: 4,
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 13 }}>{item.text}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(244,242,251,.4)",
                          marginTop: 2,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtDateTime(item.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── USERS LIST ───────────────────────────────────────────────────────────────

const COLS = "2.2fr 1.4fr 1fr 1.1fr 1.1fr 0.6fr";

type Filter = "all" | "active" | "idle" | "new" | "suspended";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

export function Users() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const navigate = useNavigate();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AdminUserDto[]>("/api/admin/users"),
  });

  const { data: groupDetail, isFetching: groupLoading } = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.get<AdminGroupDetailDto>(`/api/admin/groups/${groupId}`),
    enabled: groupId !== null,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  if (error) return <CenteredMessage>Could not load users.</CenteredMessage>;

  // Real membership of the chosen group, by Telegram id.
  const usersInGroup =
    groupId && groupDetail ? new Set(groupDetail.members.map((m) => m.telegramUserId)) : null;

  const q = search.trim().toLowerCase();
  const filtered = users
    .filter((u) => filter === "all" || u.status === filter)
    .filter((u) => !groupId || (usersInGroup?.has(u.telegramUserId) ?? false))
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        u.telegramUserId.includes(q),
    );

  const safeOffset = offset < filtered.length ? offset : 0;
  const rows = filtered.slice(safeOffset, safeOffset + limit);
  const busy = groupId !== null && groupLoading;

  const counts: Record<Filter, number> = {
    all: users.length,
    active: users.filter((u) => u.status === "active").length,
    new: users.filter((u) => u.status === "new").length,
    idle: users.filter((u) => u.status === "idle").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  };

  function changeFilter(f: Filter) {
    setFilter(f);
    setOffset(0);
  }

  function changeGroup(id: string | null) {
    setGroupId(id);
    setOffset(0);
  }

  // CSV export
  function exportCsv() {
    const cols = ["Name", "Username", "Telegram ID", "Groups", "Status", "Last Active"];
    const lines = [
      cols.join(","),
      ...filtered.map((u) =>
        [
          `"${u.displayName}"`,
          u.username ? `@${u.username}` : "",
          u.telegramUserId,
          u.groupCount,
          u.status,
          u.lastActiveAt ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jemaw-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        {/* search */}
        <div
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 11,
            padding: "10px 13px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: 300,
          }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="rgba(244,242,251,.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Search by name or @handle…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text)",
            }}
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setOffset(0); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(244,242,251,.4)", padding: 0 }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* status filter pills */}
        <div style={{ display: "flex", gap: 7 }}>
          {FILTERS.map(({ key, label }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                onClick={() => changeFilter(key)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? "#fff" : "rgba(244,242,251,.6)",
                  background: isActive ? "#6E59C7" : "transparent",
                  border: isActive ? "none" : "1px solid rgba(255,255,255,.1)",
                  padding: "9px 14px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                {label}
                {key === "all" ? ` · ${counts.all.toLocaleString()}` : ""}
              </button>
            );
          })}
        </div>

        {/* groups dropdown */}
        <GroupsDropdown
          groups={groups}
          selectedGroupId={groupId}
          onSelect={changeGroup}
        />

        <div style={{ flex: 1 }} />

        {/* export */}
        <button
          onClick={exportCsv}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.1)",
            padding: "9px 14px",
            borderRadius: 9,
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* table */}
      <div
        style={{
          background: "#16151F",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "13px 20px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "rgba(244,242,251,.4)",
          }}
        >
          <span>User</span>
          <span>Telegram</span>
          <span>Groups</span>
          <span>Status</span>
          <span>Last active</span>
          <span />
        </div>

        <Busy busy={busy}>
        {isLoading ? (
          <SkeletonRows cols={COLS} count={10} />
        ) : rows.length === 0 ? (
          <CenteredMessage>
            {q || filter !== "all" || groupId ? "No users match." : "No users yet."}
          </CenteredMessage>
        ) : (
          rows.map((u, i) => {
            const { bg, color } = getAvatarStyle(u.displayName);
            return (
              <div
                key={u.telegramUserId}
                className="jx-row"
                onClick={() => navigate(`/users/${u.telegramUserId}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      position: "relative",
                      overflow: "hidden",
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      color,
                      flex: "none",
                    }}
                  >
                    {initials(u.displayName)}
                    <PhotoFill path={u.photoUrl} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{titleCase(u.displayName)}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,242,251,.4)", fontVariantNumeric: "tabular-nums" }}>
                      ID {u.telegramUserId}
                    </div>
                  </div>
                </div>

                <span style={{ fontSize: 13, color: "#A99CE3" }}>
                  {u.username ? `@${u.username}` : "—"}
                </span>

                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {u.groupCount}
                </span>

                <StatusPill status={u.status} />

                <span style={{ fontSize: 13, color: "rgba(244,242,251,.55)" }}>
                  {relativeTime(u.lastActiveAt)}
                </span>

                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="rgba(244,242,251,.4)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  onClick={(e) => e.stopPropagation()}
                >
                  <circle cx="5" cy="12" r="1.4" />
                  <circle cx="12" cy="12" r="1.4" />
                  <circle cx="19" cy="12" r="1.4" />
                </svg>
              </div>
            );
          })
        )}
        </Busy>
        {!isLoading && (
          <TableFooter
            offset={safeOffset}
            limit={limit}
            total={filtered.length}
            onPage={setOffset}
            onLimit={(n) => {
              setLimit(n);
              setOffset(0);
            }}
            busy={busy}
            noun="users"
          />
        )}
      </div>
    </div>
  );
}
