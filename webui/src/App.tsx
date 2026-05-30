import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import BuyPage from "./pages/BuyPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import HealthPage from "./pages/HealthPage";
import LoginPage from "./pages/LoginPage";
import MealPlanPage from "./pages/MealPlanPage";
import MoneyPage from "./pages/MoneyPage";
import BudgetPage from "./pages/BudgetPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";
import WishlistPage from "./pages/WishlistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/buy" element={<BuyPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/meals" element={<MealPlanPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
