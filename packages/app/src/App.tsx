import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useGroup } from "./lib/hooks.js";
import { getGroupId } from "./lib/api.js";
import { TabBar } from "./ui/TabBar.js";
import { Home } from "./routes/Home.js";
import { Balances, Centered } from "./routes/Balances.js";
import { History } from "./routes/History.js";
import { Add } from "./routes/Add.js";
import { Settle } from "./routes/Settle.js";
import { Suggestions } from "./routes/Suggestions.js";
import { ExpenseDetail } from "./routes/ExpenseDetail.js";
import { Settings } from "./routes/Settings.js";

function Header() {
  const group = useGroup();
  const nav = useNavigate();
  const g = group.data;
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "16px 16px 0",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="t-heading">{g?.name ?? "Jemaw"}</span>
        {g && (
          <span className="t-caption" style={{ color: "var(--text-faint)" }}>
            {g.members.length} member{g.members.length === 1 ? "" : "s"} ·{" "}
            {g.defaultCurrency}
          </span>
        )}
      </div>
      <button
        aria-label="Settings"
        onClick={() => nav("/settings")}
        style={iconBtn}
      >
        ⚙
      </button>
    </header>
  );
}

const iconBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "var(--r-full)",
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 20,
};

function Shell() {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <Header />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/suggestions" element={<Suggestions />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/settle" element={<Settle />} />
          <Route path="/history" element={<History />} />
          <Route path="/add" element={<Add />} />
          <Route path="/expense/:id" element={<ExpenseDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}

export function App() {
  // Without a group context, the Mini App can't scope any data.
  if (!getGroupId()) {
    return (
      <Centered>
        Open Jemaw from your group's pinned message.
      </Centered>
    );
  }
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
