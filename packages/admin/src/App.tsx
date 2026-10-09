import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { AppShell } from "./ui/AppShell.js";
import { Login } from "./routes/Login.js";
import { Overview } from "./routes/Overview.js";
import { UserDetailPage, Users } from "./routes/Users.js";
import { GroupDetailPage, Groups } from "./routes/Groups.js";
import { PageLoader } from "./ui/Loader.js";
import { Expenses } from "./routes/Expenses.js";
import { Logs } from "./routes/Logs.js";
import { Announcements } from "./routes/Announcements.js";
import { Settings } from "./routes/Settings.js";
import { Designs } from "./routes/Designs.js";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageLoader minHeight="100vh" />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:telegramId" element={<UserDetailPage />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/designs" element={<Designs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function Root() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </AuthProvider>
  );
}
