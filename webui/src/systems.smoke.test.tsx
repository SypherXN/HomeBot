import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { CalendarZoneProvider } from "./calendar/CalendarZoneContext";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ToastProvider } from "./components/ToastProvider";
import { AUTH_STORAGE_ACTOR, AUTH_STORAGE_TOKEN } from "./auth/storageKeys";
import { createHomeBotFetchMock } from "./test/fetchMock";

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ThemeProvider>
          <CalendarZoneProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CalendarZoneProvider>
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

const routes: { path: string; heading: RegExp }[] = [
  // Dashboard heading is a time-of-day greeting ("Good morning", "Up late?", …).
  { path: "/", heading: /^(good (morning|afternoon|evening)|up late\?)/i },
  { path: "/buy", heading: /^buy list$/i },
  { path: "/wishlist", heading: /^wishlist$/i },
  { path: "/money", heading: /^money$/i },
  { path: "/budget", heading: /^budget$/i },
  { path: "/calendar", heading: /^calendar$/i },
  { path: "/meals", heading: /^meals$/i },
  { path: "/settings", heading: /^settings$/i },
  { path: "/login", heading: /^welcome back$/i },
  { path: "/setup", heading: /^household accounts$/i },
  { path: "/health", heading: /^ops & diagnostics$/i },
];

describe("Web UI — route smoke (all feature areas)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:5050");
    localStorage.setItem(AUTH_STORAGE_TOKEN, "smoke-test-token");
    localStorage.setItem(AUTH_STORAGE_ACTOR, "300001");
    vi.stubGlobal("fetch", createHomeBotFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  for (const { path, heading } of routes) {
    it(`renders ${path}`, async () => {
      renderRoute(path);
      await waitFor(
        () => {
          expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
        },
        { timeout: 8000 }
      );
    });
  }

  it("renders OAuth callback route", async () => {
    render(
      <MemoryRouter initialEntries={["/oauth/callback?oauth_error=access_denied"]}>
        <AuthProvider>
          <CalendarZoneProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CalendarZoneProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^discord sign-in$/i })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/access_denied/i);
    });
  });
});
