import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl, subscribeApiBaseUrl } from "../api";
import { useApiConnectionStatus } from "../hooks/useApiConnectionStatus";

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/buy", label: "Buy" },
  { to: "/wishlist", label: "Wishlist" },
  { to: "/money", label: "Money" },
  { to: "/calendar", label: "Calendar" },
  { to: "/settings", label: "Settings" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "block shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
  ].join(" ");
}

/**
 * Login / setup: side-by-side in the horizontal mobile strip; stacked full-width in the desktop sidebar (same as other links).
 */
function authNavClass({ isActive }: { isActive: boolean }) {
  return [
    "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    "inline-flex items-center justify-center whitespace-nowrap md:block md:w-full",
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
  ].join(" ");
}

function connectionLabel(status: ReturnType<typeof useApiConnectionStatus>["status"]): {
  text: string;
  dotClass: string;
  title: string;
} {
  if (status.phase === "checking") {
    return {
      text: "Checking connection…",
      dotClass: "bg-slate-500 animate-pulse",
      title: "Probing API",
    };
  }
  if (status.phase === "down") {
    return {
      text: "API unreachable",
      dotClass: "bg-red-500",
      title: status.detail,
    };
  }
  if (status.auth === "bad") {
    return {
      text: "Token not accepted",
      dotClass: "bg-amber-500",
      title: "Bearer token is set but the API rejected it. Check Settings.",
    };
  }
  if (status.auth === "none") {
    return {
      text: "API online — add token",
      dotClass: "bg-sky-500",
      title: "Health OK. Set a bearer token in Settings to use features.",
    };
  }
  return {
    text: "Connected",
    dotClass: "bg-emerald-500",
    title: "API is reachable and your token works.",
  };
}

export default function AppShell() {
  const { token, webUsername } = useAuth();
  const hasToken = token.trim().length > 0;
  const { status } = useApiConnectionStatus(token);
  const conn = connectionLabel(status);
  const [apiBaseDisplay, setApiBaseDisplay] = useState(() => getApiBaseUrl());
  useEffect(() => subscribeApiBaseUrl(() => setApiBaseDisplay(getApiBaseUrl())), []);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-800 bg-slate-900/80 md:w-52 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">HomeBot</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-block h-2 w-2 rounded-full ${hasToken ? "bg-emerald-500" : "bg-amber-500"}`}
                title={hasToken ? "Bearer set (API token or web session)" : "No bearer token"}
              />
              API
            </div>
            {webUsername ? (
              <div className="mt-2 truncate text-xs text-slate-400" title={webUsername}>
                Signed in as <span className="text-slate-200">{webUsername}</span>
              </div>
            ) : null}
          </div>
        </div>
        <nav className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-2 pb-3 md:mx-0 md:flex-col md:flex-wrap md:overflow-visible">
          {nav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end ?? false} className={navClass}>
              {label}
            </NavLink>
          ))}
          <div className="flex shrink-0 flex-row gap-1 md:mt-2 md:w-full md:flex-col md:gap-1">
            <NavLink to="/login" className={authNavClass}>
              Sign in
            </NavLink>
            <NavLink to="/setup" className={authNavClass}>
              New account
            </NavLink>
          </div>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-800 bg-slate-950/50 px-4 py-3 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 truncate text-xs text-slate-500">
              <span className="text-slate-400">Base URL</span>{" "}
              <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">{apiBaseDisplay}</code>
            </p>
            <div
              className="flex shrink-0 items-center gap-2 text-xs text-slate-300"
              title={conn.title}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${conn.dotClass}`}
                aria-hidden
              />
              <span className="font-medium text-slate-200">{conn.text}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-6xl px-3 py-6 sm:px-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
