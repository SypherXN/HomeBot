import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { CalendarZoneProvider } from "./calendar/CalendarZoneContext";
import "./index.css";
import App from "./App.tsx";

const routerBasename = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename.length > 0 ? routerBasename : undefined}>
      <AuthProvider>
        <CalendarZoneProvider>
          <App />
        </CalendarZoneProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
