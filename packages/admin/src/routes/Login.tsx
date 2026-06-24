import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.28)" }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em" }}>Jemaw</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.65)" }}>
              Admin Console
            </div>
          </div>
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 46, lineHeight: 1.02, letterSpacing: "-.03em", margin: "0 0 18px", maxWidth: 440 }}>
            The control room for the quiet bookkeeper.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,.78)", maxWidth: 430, margin: 0 }}>
            Manage users, groups, expenses and the bot itself — everything Jemaw tracks across every Telegram community, in one place.
          </p>
        </div>
        <div style={{ fontFamily: "'Noto Sans Ethiopic',sans-serif", fontSize: 20, color: "rgba(255,255,255,.55)" }}>
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••"
              style={inputStyle}
            />
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
