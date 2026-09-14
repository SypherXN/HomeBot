import { Navigate, Route, Routes } from "react-router-dom";
import NavRouteGuard from "./components/NavRouteGuard";
import AppShell from "./layout/AppShell";
import BuyPage from "./pages/BuyPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import HealthPage from "./pages/HealthPage";
import LoginPage from "./pages/LoginPage";
import MealPlanPage from "./pages/MealPlanPage";
import MoneyPage from "./pages/MoneyPage";
import BudgetPage from "./pages/BudgetPage";
import BudgetAccountPage from "./pages/BudgetAccountPage";
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
        <Route path="/buy" element={<NavRouteGuard pageId="buy"><BuyPage /></NavRouteGuard>} />
        <Route path="/wishlist" element={<NavRouteGuard pageId="wishlist"><WishlistPage /></NavRouteGuard>} />
        <Route path="/money" element={<NavRouteGuard pageId="money"><MoneyPage /></NavRouteGuard>} />
        <Route path="/budget" element={<NavRouteGuard pageId="budget"><BudgetPage /></NavRouteGuard>} />
        <Route
          path="/budget/accounts/:accountId"
          element={<NavRouteGuard pageId="budget"><BudgetAccountPage /></NavRouteGuard>}
        />
        <Route path="/calendar" element={<NavRouteGuard pageId="calendar"><CalendarPage /></NavRouteGuard>} />
        <Route path="/meals" element={<NavRouteGuard pageId="meals"><MealPlanPage /></NavRouteGuard>} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
