import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import type { AdminPublicStatsDto } from "@jemaw/shared/types";

/** Compact a number for the brand panel: 1248 → "1,248", 8_420_000 → "8.4M". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

export function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => api.get<AdminPublicStatsDto>("/api/admin/public-stats"),
    staleTime: 60_000,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password, remember);
    } catch {
      setError("Sign-in failed. Check your credentials and access.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(remember);
    } catch {
      setError("Google sign-in failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Brand panel */}
      <div
        style={{
          flex: 1.1,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(160deg,#2A1F5C 0%,#463494 52%,#6E59C7 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
        }}
      >
        {/* background flourishes */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 80% 8%, rgba(255,255,255,.18), transparent 60%)" }} />
        <svg viewBox="0 0 100 100" style={{ position: "absolute", right: -120, bottom: -140, width: 560, height: 560, opacity: 0.13 }}>
          <circle cx="50" cy="40" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
          <circle cx="37" cy="62" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
          <circle cx="63" cy="62" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
        </svg>

        {/* logo */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.28)", position: "relative", overflow: "hidden" }}>
            <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 8 }}>
              <circle cx="50" cy="40" r="23" fill="#fff" opacity={0.96} style={{ mixBlendMode: "screen" }} />
              <circle cx="37" cy="62" r="23" fill="#E5DFF5" opacity={0.96} style={{ mixBlendMode: "screen" }} />
              <circle cx="63" cy="62" r="23" fill="#C8BFEF" opacity={0.96} style={{ mixBlendMode: "screen" }} />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em" }}>Jemaw</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.65)" }}>
              Admin Console
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 46, lineHeight: 1.02, letterSpacing: "-.03em", margin: "0 0 18px", maxWidth: 440 }}>
            The control room for the quiet bookkeeper.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,.78)", maxWidth: 430, margin: 0 }}>
            Manage users, groups, expenses and the bot itself — everything Jemaw tracks across every Telegram community, in one place.
          </p>
          <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>
                {stats ? compact(stats.totalUsers) : "—"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>users</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>
                {stats ? compact(stats.activeGroups) : "—"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>groups</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>
                {stats ? compact(Math.round(Number(stats.expensesTracked))) : "—"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Br tracked</div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", fontFamily: "var(--font-brand)", fontSize: 20, color: "rgba(255,255,255,.55)" }}>
          ጀማው · crowd, managed
        </div>
      </div>

      {/* Form panel */}
      <div style={{ flex: 1, background: "var(--bg-panel)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-soft)", marginBottom: 12 }}>
            Secure sign-in
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", margin: "0 0 8px" }}>
            Welcome back, admin
          </h2>
          <p style={{ fontSize: 14, color: "rgba(244,242,251,.55)", margin: "0 0 30px" }}>
            Authorized personnel only. Sessions are logged.
          </p>

          <label style={{ display: "block", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "rgba(244,242,251,.5)", marginBottom: 7 }}>EMAIL</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@jemaw.et"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "rgba(244,242,251,.5)", marginBottom: 7 }}>PASSWORD</div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••••"
                style={{ ...inputStyle, paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  height: "100%",
                  width: 46,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span style={{ fontSize: 13, color: "rgba(244,242,251,.7)" }}>Remember this device</span>
          </label>

          {error && (
            <div style={{ marginBottom: 14, fontSize: 13, color: "var(--danger)" }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              background: "var(--accent)",
              border: "none",
              borderRadius: 12,
              padding: 15,
              textAlign: "center",
              fontSize: 16,
              fontWeight: 700,
              color: "#fff",
              cursor: busy ? "default" : "pointer",
              boxShadow: "0 12px 30px -10px rgba(110,89,199,.7)",
            }}
          >
            {busy ? "Signing in…" : "Sign in to console"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            style={{
              width: "100%",
              background: "#fff",
              border: "none",
              borderRadius: 12,
              padding: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontSize: 15,
              fontWeight: 600,
              color: "#1f1f1f",
              cursor: busy ? "default" : "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.2C12.3 13.3 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.4z" />
              <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.9-6.2z" />
              <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.6 2.3-6.3 0-11.7-3.8-13.6-9.4l-7.9 6.2C6.4 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 12,
  padding: "14px 15px",
  fontSize: 15,
  color: "var(--text)",
  outline: "none",
} as const;
