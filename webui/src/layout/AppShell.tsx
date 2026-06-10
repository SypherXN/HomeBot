import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl, getMeta, subscribeApiBaseUrl } from "../api";
import { useApiConnectionStatus } from "../hooks/useApiConnectionStatus";
import { useBudgetAlertCount } from "../hooks/useBudgetAlertCount";
import GlobalSearch from "../components/GlobalSearch";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import { useGlobalKeyboardShortcuts } from "../hooks/useGlobalKeyboardShortcuts";
import { useTheme } from "../theme/ThemeProvider";
import { Icon, type IconName } from "../components/icons";

type NavItem = { to: string; label: string; icon: IconName; end?: boolean };

const navGroups: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ to: "/", label: "Home", icon: "home", end: true }] },
  {
    label: "Household",
    items: [
      { to: "/buy", label: "Buy", icon: "buy" },
      { to: "/wishlist", label: "Wishlist", icon: "wishlist" },
      { to: "/meals", label: "Meals", icon: "meals" },
    ],
  },
  {
    label: "Finances",
    items: [
      { to: "/money", label: "Money", icon: "money" },
      { to: "/budget", label: "Budget", icon: "budget" },
    ],
  },
  {
    label: "Planning",
    items: [{ to: "/calendar", label: "Calendar", icon: "calendar" }],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: "settings" }],
  },
];

const flatNav: NavItem[] = navGroups.flatMap((g) => g.items);

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "group flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all md:py-2",
    isActive
      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[0_4px_16px_-4px] shadow-blue-600/40"
      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
  ].join(" ");
}

function authNavClass({ isActive }: { isActive: boolean }) {
  return [
    "flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all md:justify-start md:py-2",
    isActive
      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[0_4px_16px_-4px] shadow-blue-600/40"
      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
  ].join(" ");
}

function looksLikeBrowserNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  );
}

function connectionLabel(status: ReturnType<typeof useApiConnectionStatus>["status"]): {
  text: string;
  dotClass: string;
  title: string;
} {
  if (status.phase === "checking") {
    return {
      text: "Checking…",
      dotClass: "bg-slate-500 animate-pulse",
      title: "Probing API",
    };
  }
  if (status.phase === "offline") {
    return {
      text: "Offline",
      dotClass: "bg-slate-600",
      title: "No network on this device. Reconnect to reach HomeBot.",
    };
  }
  if (status.phase === "down") {
    const unreachable = looksLikeBrowserNetworkFailure(status.detail);
    return {
      text: unreachable ? "Cannot reach API" : "API error",
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
      text: "Online — add token",
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

function BrandMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 text-white shadow-[0_4px_18px_-4px] shadow-blue-600/50">
      <Icon name="home" className="h-5 w-5" />
    </span>
  );
}

export default function AppShell() {
  const { token, webUsername } = useAuth();
  const hasToken = token.trim().length > 0;
  const { status } = useApiConnectionStatus(token);
  const { count: budgetAlertCount } = useBudgetAlertCount(token);
  const conn = connectionLabel(status);
  const [apiBaseDisplay, setApiBaseDisplay] = useState(() => getApiBaseUrl());
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const { helpOpen, setHelpOpen } = useGlobalKeyboardShortcuts();
  const { theme, toggleTheme } = useTheme();
  useEffect(() => subscribeApiBaseUrl(() => setApiBaseDisplay(getApiBaseUrl())), []);

  useEffect(() => {
    if (status.phase !== "up" || status.auth !== "ok" || !hasToken) {
      setBackupWarning(null);
      return;
    }
    void getMeta()
      .then((meta) => {
        const backups =
          meta && typeof meta === "object" && meta !== null
            ? (meta as { backups?: { exists?: boolean; latestModifiedUtc?: string } }).backups
            : undefined;
        if (backups && backups.exists === false) {
          setBackupWarning("No backup directory configured — see Diagnostics.");
          return;
        }
        if (!backups?.latestModifiedUtc) return;
        const ageMs = Date.now() - Date.parse(backups.latestModifiedUtc);
        if (Number.isFinite(ageMs) && ageMs > 7 * 24 * 60 * 60 * 1000) {
          setBackupWarning(`Latest backup is ${Math.floor(ageMs / 86400000)} days old.`);
        } else {
          setBackupWarning(null);
        }
      })
      .catch(() => setBackupWarning(null));
  }, [status.phase, hasToken]);

  function budgetBadge(to: string) {
    if (to !== "/budget" || budgetAlertCount <= 0 || !hasToken) return null;
    return (
      <span
        className="ml-auto rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950"
        title={`${budgetAlertCount} budget alert(s)`}
      >
        {budgetAlertCount > 9 ? "9+" : budgetAlertCount}
      </span>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-800/70 bg-slate-900/40 backdrop-blur md:flex md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-4 pb-2 pt-4 md:pb-4">
          <BrandMark />
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold tracking-tight text-white">
              HomeBot
            </div>
            {webUsername ? (
              <div className="truncate text-xs text-slate-400" title={webUsername}>
                {webUsername}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${hasToken ? "bg-emerald-500" : "bg-amber-500"}`}
                  title={hasToken ? "Bearer set (API token or web session)" : "No bearer token"}
                />
                {hasToken ? "API ready" : "No token"}
              </div>
            )}
          </div>
        </div>

        {/* Mobile: horizontal icon strip. Desktop: grouped vertical nav. */}
        <nav className="no-scrollbar flex flex-nowrap gap-1 overflow-x-auto px-3 pb-3 md:hidden">
          {flatNav.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end ?? false} className={navClass}>
              <Icon name={icon} className="h-4 w-4 shrink-0" />
              {label}
              {budgetBadge(to)}
            </NavLink>
          ))}
          <NavLink to="/login" className={authNavClass}>
            <Icon name="login" className="h-4 w-4 shrink-0" />
            Sign in
          </NavLink>
          <NavLink to="/setup" className={authNavClass}>
            <Icon name="user-plus" className="h-4 w-4 shrink-0" />
            New account
          </NavLink>
        </nav>

        <nav className="hidden flex-1 flex-col gap-0.5 px-3 pb-4 md:flex">
          {navGroups.map((group) => (
            <div key={group.label ?? "root"} className="flex flex-col gap-0.5">
              {group.label ? (
                <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {group.label}
                </div>
              ) : null}
              {group.items.map(({ to, label, icon, end }) => (
                <NavLink key={to} to={to} end={end ?? false} className={navClass}>
                  <Icon name={icon} className="h-4 w-4 shrink-0" />
                  {label}
                  {budgetBadge(to)}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="mt-4 flex flex-col gap-0.5 border-t border-slate-800/70 pt-3">
            <NavLink to="/login" className={authNavClass}>
              <Icon name="login" className="h-4 w-4 shrink-0" />
              Sign in
            </NavLink>
            <NavLink to="/setup" className={authNavClass}>
              <Icon name="user-plus" className="h-4 w-4 shrink-0" />
              New account
            </NavLink>
          </div>

          <div className="mt-auto flex flex-col gap-1 pt-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-slate-700/80 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
            >
              {theme === "dark" ? "Switch to light" : "Switch to dark"}
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-xl border border-slate-700/80 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
            >
              Keyboard shortcuts (?)
            </button>
          </div>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="top-0 z-40 border-b border-slate-800/70 bg-slate-950/50 px-4 py-3 backdrop-blur md:sticky">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:max-w-xs">
              <GlobalSearch token={token} />
              <div
                className="flex shrink-0 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 sm:hidden"
                title={conn.title}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${conn.dotClass}`}
                  aria-hidden
                />
                <span className="font-medium text-slate-200">{conn.text}</span>
              </div>
            </div>
            <p className="min-w-0 truncate text-xs text-slate-500 sm:max-w-[45%]">
              <span className="text-slate-400">Base URL</span>{" "}
              <code className="rounded-md bg-slate-900 px-1.5 py-0.5 text-slate-300">
                {apiBaseDisplay}
              </code>{" "}
              <Link to="/health" className="shrink-0 text-blue-400 hover:underline">
                Diagnostics
              </Link>
            </p>
            <div
              className="hidden shrink-0 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 sm:flex"
              title={conn.title}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${conn.dotClass}`} aria-hidden />
              <span className="font-medium text-slate-200">{conn.text}</span>
            </div>
          </div>
        </header>
        {status.phase === "offline" ? (
          <div
            role="alert"
            className="border-b border-slate-700 bg-slate-900/90 px-4 py-2.5 text-sm text-slate-200"
          >
            <span className="font-medium text-slate-100">You appear to be offline.</span>{" "}
            <span className="text-slate-400">Reconnect, then the app will retry automatically.</span>
          </div>
        ) : null}
        {status.phase === "down" ? (
          <div
            role="alert"
            className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-100"
          >
            <span className="font-medium text-amber-50">
              {looksLikeBrowserNetworkFailure(status.detail)
                ? "Cannot reach the API at the current base URL."
                : "The API returned an error while checking health."}
            </span>{" "}
            <Link to="/settings" className="font-medium text-amber-200 underline hover:text-white">
              Settings
            </Link>
            <span className="text-amber-200/90"> — URL, CORS, and firewall.</span>
          </div>
        ) : null}
        {backupWarning ? (
          <div
            role="status"
            className="border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-sm text-amber-100"
          >
            {backupWarning}{" "}
            <Link to="/health" className="font-medium text-amber-200 underline hover:text-white">
              Diagnostics
            </Link>
          </div>
        ) : null}
        <main className="mx-auto min-w-0 max-w-6xl px-3 py-6 sm:px-5 sm:py-8">
          <Outlet />
        </main>
      </div>
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
