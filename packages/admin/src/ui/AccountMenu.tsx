/**
 * Sidebar account menu: who is signed in (role from the API, sign-in method,
 * last sign-in), a shortcut to settings, password reset for email accounts,
 * console admin management, and sign out.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { AdminAccountsDto, AdminMeDto } from "@jemaw/shared/types";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { Dialog, GhostButton, fieldStyle } from "./Dialog.js";
import { Loader, SkeletonList } from "./Loader.js";
import { PrimaryButton } from "./primitives.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<AdminMeDto>("/api/admin/me"), staleTime: 5 * 60_000 });
}

function Avatar({ name, photo, size }: { name: string; photo?: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(140deg,#6E59C7,#A99CE3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        flex: "none",
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RolePill({ role }: { role: "super" | "admin" | undefined }) {
  if (!role) return null;
  const sup = role === "super";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".03em",
        color: sup ? "#A99CE3" : "rgba(244,242,251,.6)",
        background: sup ? "rgba(110,89,199,.2)" : "rgba(255,255,255,.07)",
        padding: "2px 7px",
        borderRadius: 6,
        flex: "none",
      }}
    >
      {sup ? "Super admin" : "Admin"}
    </span>
  );
}

export function AccountMenu() {
  const { user, logout, sendPasswordReset } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [adminsOpen, setAdminsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = useMutation({
    mutationFn: sendPasswordReset,
    onSuccess: () => setNotice(`Reset link sent to ${user?.email}.`),
    onError: (e) => setNotice(errText(e)),
  });

  const email = user?.email ?? "";
  const name = user?.displayName || email.split("@")[0] || "Admin";
  const viaGoogle = user?.providerData.some((p) => p.providerId === "google.com") ?? false;
  const hasPassword = user?.providerData.some((p) => p.providerId === "password") ?? false;
  const lastSignIn = user?.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  async function signOut() {
    setSigningOut(true);
    qc.clear();
    await logout();
  }

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "#1A1925",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 14,
            boxShadow: "0 -18px 48px -16px rgba(0,0,0,.7)",
            overflow: "hidden",
            zIndex: 60,
          }}
        >
          <div style={{ padding: 14, display: "flex", gap: 11, alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <Avatar name={name} photo={user?.photoURL} size={38} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={email}>
                {email}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5 }}>
                <RolePill role={me?.role} />
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{viaGoogle ? "Google" : "Email & password"}</span>
              </div>
            </div>
          </div>
          {lastSignIn && <div style={{ fontSize: 10.5, color: "var(--text-faint)", padding: "8px 14px 0" }}>Signed in {lastSignIn}</div>}
          <div style={{ padding: 6 }}>
            <MenuItem icon="settings" onClick={() => go("/settings")}>
              Bot &amp; settings
            </MenuItem>
            <MenuItem icon="people" onClick={() => { setOpen(false); setAdminsOpen(true); }}>
              Console admins
            </MenuItem>
            <MenuItem icon="logs" onClick={() => go("/logs")}>
              Activity log
            </MenuItem>
            {hasPassword && (
              <MenuItem icon="key" onClick={() => reset.mutate()} disabled={reset.isPending} busy={reset.isPending}>
                Send password reset email
              </MenuItem>
            )}
            {notice && <div style={{ fontSize: 11.5, color: reset.isError ? "var(--danger)" : "var(--success)", padding: "4px 10px 6px" }}>{notice}</div>}
            <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "5px 4px" }} />
            <MenuItem icon="exit" tone="danger" onClick={() => void signOut()} disabled={signingOut} busy={signingOut}>
              Sign out
            </MenuItem>
          </div>
        </div>
      )}

      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => {
          setNotice(null);
          setOpen((o) => !o);
        }}
        className="jx-navitem"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 8,
          borderRadius: 11,
          border: `1px solid ${open ? "rgba(169,156,227,.35)" : "transparent"}`,
          background: open ? "rgba(110,89,199,.12)" : "transparent",
          cursor: "pointer",
          color: "var(--text)",
          textAlign: "left",
        }}
      >
        <Avatar name={name} photo={user?.photoURL} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {me ? (me.role === "super" ? "Super admin" : "Admin") : email}
          </div>
        </div>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>

      {adminsOpen && <AdminsDialog myEmail={email} onClose={() => setAdminsOpen(false)} />}
    </div>
  );
}

const ICONS: Record<string, string> = {
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  logs: "M4 6h16 M4 12h10 M4 18h13",
  key: "M15.5 7.5a3.5 3.5 0 1 1-5 3.2L3 18.2V21h2.8l.7-.7V18h2.3v-2.3H11l1.8-1.8a3.5 3.5 0 0 1 2.7-6.4Z",
  exit: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};

function MenuItem({
  icon,
  children,
  onClick,
  tone,
  disabled,
  busy,
}: {
  icon: keyof typeof ICONS;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="jx-navitem"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: tone === "danger" ? "var(--danger)" : "var(--text)",
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
      }}
    >
      {busy ? (
        <Loader size={15} />
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, flex: "none" }}>
          <path d={ICONS[icon]} />
        </svg>
      )}
      {children}
    </button>
  );
}

function AdminsDialog({ myEmail, onClose }: { myEmail: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "super">("admin");
  const { data, isLoading } = useQuery({ queryKey: ["admins"], queryFn: () => api.get<AdminAccountsDto>("/api/admin/admins") });
  const done = (next: AdminAccountsDto) => {
    qc.setQueryData(["admins"], next);
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };
  const upsert = useMutation({
    mutationFn: (input: { email: string; role: "admin" | "super" }) => api.put<AdminAccountsDto>("/api/admin/admins", input),
    onSuccess: (next) => {
      done(next);
      setEmail("");
    },
  });
  const remove = useMutation({
    mutationFn: (e: string) => api.delete<AdminAccountsDto>(`/api/admin/admins/${encodeURIComponent(e)}`),
    onSuccess: done,
  });
  const canManage = data?.canManage ?? false;
  const error = upsert.error ?? remove.error;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Dialog
      title="Console admins"
      subtitle={canManage ? "People who can sign in to this console. They sign in with Google or an email account using this address." : "Only super admins can change this list."}
      onClose={onClose}
      width={520}
    >
      {isLoading ? (
        <SkeletonList count={3} height={40} padding={0} />
      ) : (
        <div style={{ border: "1px solid var(--hairline-2)", borderRadius: 12, overflow: "hidden" }}>
          {data?.admins.map((a, i) => {
            const you = a.email === myEmail.toLowerCase();
            const busy = (upsert.isPending && upsert.variables?.email === a.email) || (remove.isPending && remove.variables === a.email);
            return (
              <div key={a.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                <Avatar name={a.email} size={28} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.email}
                  {you && <span style={{ color: "var(--text-faint)" }}> · you</span>}
                </div>
                {busy && <Loader size={15} />}
                {canManage && !you ? (
                  <>
                    <select
                      aria-label={`Role for ${a.email}`}
                      value={a.role}
                      disabled={busy}
                      onChange={(e) => upsert.mutate({ email: a.email, role: e.target.value as "admin" | "super" })}
                      style={{ ...fieldStyle, width: "auto", padding: "5px 8px", fontSize: 12 }}
                    >
                      <option value="admin">Admin</option>
                      <option value="super">Super admin</option>
                    </select>
                    <button
                      aria-label={`Remove ${a.email}`}
                      onClick={() => remove.mutate(a.email)}
                      disabled={busy}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <RolePill role={a.role} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {canManage && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && validEmail && upsert.mutate({ email: email.trim(), role })}
            placeholder="name@example.com"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "super")} style={{ ...fieldStyle, width: "auto" }}>
            <option value="admin">Admin</option>
            <option value="super">Super admin</option>
          </select>
          <PrimaryButton onClick={() => upsert.mutate({ email: email.trim(), role })} disabled={!validEmail || upsert.isPending}>
            Add
          </PrimaryButton>
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{errText(error)}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <GhostButton onClick={onClose}>Done</GhostButton>
      </div>
    </Dialog>
  );
}
