import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import BuyPage from "./pages/BuyPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import WishlistPage from "./pages/WishlistPage";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/health" element={<WorkspacePage section="health" />} />
        <Route path="/buy" element={<BuyPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/money" element={<WorkspacePage section="money" />} />
        <Route path="/calendar" element={<WorkspacePage section="calendar" />} />
        <Route path="/undo" element={<WorkspacePage section="undo" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
