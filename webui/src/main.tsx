import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { CalendarZoneProvider } from "./calendar/CalendarZoneContext";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CalendarZoneProvider>
          <App />
        </CalendarZoneProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
