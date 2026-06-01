import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
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

/** A small settings gear floating at the top-right (no header bar). */
function SettingsButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  if (pathname === "/settings") return null; // hide on the settings page itself
  return (
    <button
      aria-label="Settings"
      onClick={() => nav("/settings")}
      style={{
        position: "fixed",
        top: "calc(8px + env(safe-area-inset-top))",
        right: 12,
        zIndex: 40,
        width: 38,
        height: 38,
        borderRadius: "var(--r-full)",
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
        backdropFilter: "blur(8px)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: 18,
      }}
    >
      ⚙
    </button>
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
      <SettingsButton />
      <main
        style={{
          flex: 1,
          paddingTop: "calc(8px + env(safe-area-inset-top))",
        }}
      >
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
