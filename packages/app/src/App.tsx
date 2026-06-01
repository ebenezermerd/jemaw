import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect } from "react";
import { getGroupId } from "./lib/api.js";
import { hideTelegramBack } from "./telegram.js";
import { useRefresh, useGroup } from "./lib/hooks.js";
import { TabBar } from "./ui/TabBar.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";
import { Splash } from "./ui/Splash.js";
import { Home } from "./routes/Home.js";
import { Balances } from "./routes/Balances.js";
import { History } from "./routes/History.js";
import { Add } from "./routes/Add.js";
import { Settle } from "./routes/Settle.js";
import { SettleForm } from "./routes/SettleForm.js";
import { Suggestions } from "./routes/Suggestions.js";
import { ExpenseDetail } from "./routes/ExpenseDetail.js";
import { Settings } from "./routes/Settings.js";

const ROOT_PATHS = new Set([
  "/",
  "/suggestions",
  "/balances",
  "/settle",
  "/history",
]);

/**
 * Empty top spacer on root tabs (settings via long-press of +). On root pages we
 * also hide Telegram's BackButton so the OS back gesture minimizes the app as
 * expected; internal pages render their own PageHeader which shows it.
 */
function HeaderBar() {
  const { pathname } = useLocation();
  const isRoot = ROOT_PATHS.has(pathname);
  useEffect(() => {
    if (isRoot) hideTelegramBack();
  }, [isRoot]);
  if (!isRoot) return null; // internal pages bring their own PageHeader
  return (
    <header
      style={{
        height: 56,
        paddingTop: "calc(12px + env(safe-area-inset-top))",
        boxSizing: "content-box",
      }}
    />
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
          <Route path="/settle/new" element={<SettleForm />} />
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
      <Splash
        subtitle="open from your group"
        hint="Tap the pinned “Open Jemaw” button in your group chat to get started."
      />
    );
  }
  return (
    <BrowserRouter>
      <Booting>
        <Shell />
      </Booting>
    </BrowserRouter>
  );
}

/** Show the splash until the group context has loaded once. */
function Booting({ children }: { children: React.ReactNode }) {
  const group = useGroup();
  if (group.isLoading && !group.data) return <Splash />;
  return <>{children}</>;
}
