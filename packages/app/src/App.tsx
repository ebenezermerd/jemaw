import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { getGroupId } from "./lib/api.js";
import { useRefresh } from "./lib/hooks.js";
import { TabBar } from "./ui/TabBar.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import { Home } from "./routes/Home.js";
import { Balances, Centered } from "./routes/Balances.js";
import { History } from "./routes/History.js";
import { Add } from "./routes/Add.js";
import { Settle } from "./routes/Settle.js";
import { Suggestions } from "./routes/Suggestions.js";
import { ExpenseDetail } from "./routes/ExpenseDetail.js";
import { Settings } from "./routes/Settings.js";

/** Empty top bar (no name/count) holding only the settings gear, right-aligned. */
function HeaderBar() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        height: 56,
        padding: "12px 16px",
        paddingTop: "calc(12px + env(safe-area-inset-top))",
        boxSizing: "content-box",
      }}
    >
      {pathname !== "/settings" && (
        <button
          aria-label="Settings"
          onClick={() => nav("/settings")}
          style={{
            width: 38,
            height: 38,
            borderRadius: "var(--r-full)",
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          ⚙
        </button>
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
      <HeaderBar />
      <RefreshableMain />
      <TabBar />
    </div>
  );
}

/** Routes wrapped in pull-to-refresh; scans on Home/Suggestions. */
function RefreshableMain() {
  const { pathname } = useLocation();
  const refresh = useRefresh();
  const scanHere = pathname === "/" || pathname === "/suggestions";
  return (
    <main style={{ flex: 1 }}>
      <PullToRefresh onRefresh={() => refresh({ scan: scanHere })}>
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
      </PullToRefresh>
    </main>
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
