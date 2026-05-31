import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useGroup } from "./lib/hooks.js";
import { getGroupId } from "./lib/api.js";
import { TabBar } from "./ui/TabBar.js";
import { Balances, Centered } from "./routes/Balances.js";
import { History } from "./routes/History.js";
import { Add } from "./routes/Add.js";
import { Settings } from "./routes/Settings.js";

function Header() {
  const group = useGroup();
  const g = group.data;
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px 16px 0",
      }}
    >
      <span className="t-heading">{g?.name ?? "Jemaw"}</span>
      {g && (
        <span className="t-caption" style={{ color: "var(--text-faint)" }}>
          {g.members.length} member{g.members.length === 1 ? "" : "s"} ·{" "}
          {g.defaultCurrency}
        </span>
      )}
    </header>
  );
}

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
          <Route path="/" element={<Navigate to="/balances" replace />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/history" element={<History />} />
          <Route path="/add" element={<Add />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/balances" replace />} />
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
