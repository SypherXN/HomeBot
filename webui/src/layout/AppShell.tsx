import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl, getMeta, subscribeApiBaseUrl } from "../api";
import { useApiConnectionStatus } from "../hooks/useApiConnectionStatus";
import { useBudgetAlertCount } from "../hooks/useBudgetAlertCount";
import GlobalSearch from "../components/GlobalSearch";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import NotificationCenter from "../components/NotificationCenter";
import Sheet from "../components/Sheet";
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

/** Primary mobile tab-bar destinations. */
const TAB_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/buy", label: "Buy", icon: "buy" },
  { to: "/calendar", label: "Calendar", icon: "calendar" },
  { to: "/budget", label: "Budget", icon: "budget" },
];

/** Destinations that live in the mobile "More" sheet (everything not on the tab bar). */
const MORE_ITEMS: NavItem[] = flatNav.filter(
  (i) => !TAB_ITEMS.some((t) => t.to === i.to)
);

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "group flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all md:py-2",
    isActive
      ? "bg-gradient-to-r from-cyan-500/20 via-blue-600/30 to-violet-600/25 text-white ring-1 ring-cyan-400/30 shadow-[0_0_20px_-6px] shadow-cyan-400/40"
      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
  ].join(" ");
}

function authNavClass({ isActive }: { isActive: boolean }) {
  return [
    "flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all md:justify-start md:py-2",
    isActive
      ? "bg-gradient-to-r from-cyan-500/20 via-blue-600/30 to-violet-600/25 text-white ring-1 ring-cyan-400/30 shadow-[0_0_20px_-6px] shadow-cyan-400/40"
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
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-600 to-violet-600 text-white shadow-[0_0_18px_-2px] shadow-cyan-400/50 ring-1 ring-cyan-300/30">
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  const shellAlerts: { key: string; message: string; to?: string; linkLabel?: string }[] = [
    ...(status.phase === "down"
      ? [
          {
            key: "api-down",
            message: looksLikeBrowserNetworkFailure(status.detail)
              ? "Cannot reach the API at the current base URL."
              : "The API returned an error while checking health.",
            to: "/settings",
            linkLabel: "Settings",
          },
        ]
      : []),
    ...(backupWarning
      ? [{ key: "backup", message: backupWarning, to: "/health", linkLabel: "Diagnostics" }]
      : []),
  ];
  const bellCount = budgetAlertCount + shellAlerts.length;

  function bellButton(className = "") {
    return (
      <button
        type="button"
        onClick={() => setNotifOpen(true)}
        aria-label={bellCount > 0 ? `Notifications (${bellCount})` : "Notifications"}
        className={`relative shrink-0 rounded-full border border-slate-700/70 bg-slate-900/60 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${className}`}
      >
        <Icon name="bell" className="h-4 w-4" />
        {bellCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-amber-950">
            {bellCount > 9 ? "9+" : bellCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hb-sidebar hidden md:flex md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center gap-3 px-4 pb-4 pt-4">
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

        <nav className="flex-1 flex flex-col gap-0.5 px-3 pb-4">
          {navGroups.map((group) => (
            <div key={group.label ?? "root"} className="flex flex-col gap-0.5">
              {group.label ? (
                <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
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
        {/* Mobile top bar: brand + search + bell. Desktop: search + status. */}
        <header className="hb-topbar top-0 z-40 px-3 py-2.5 sm:px-4 sm:py-3 md:sticky">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/" className="flex shrink-0 items-center gap-2 md:hidden" aria-label="HomeBot home">
              <BrandMark />
            </Link>
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <GlobalSearch token={token} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {bellButton()}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                className="shrink-0 rounded-full border border-slate-700/70 bg-slate-900/60 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />
              </button>
              <div
                className="hidden shrink-0 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 sm:flex"
                title={conn.title}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${conn.dotClass}`} aria-hidden />
                <span className="font-medium text-slate-200">{conn.text}</span>
              </div>
              <p className="hidden min-w-0 truncate text-xs text-slate-500 lg:block lg:max-w-[40%]">
                <code className="rounded-md bg-slate-900 px-1.5 py-0.5 text-slate-300">
                  {apiBaseDisplay}
                </code>{" "}
                <Link to="/health" className="shrink-0 text-blue-400 hover:underline">
                  Diagnostics
                </Link>
              </p>
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
        <main className="mx-auto min-w-0 max-w-6xl px-3 pb-28 pt-6 sm:px-5 md:pb-10 md:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="hb-tabbar md:hidden" aria-label="Primary">
        <div className="grid grid-cols-5">
          {TAB_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive ? "text-blue-300" : "text-slate-500 hover:text-slate-300"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -top-px h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-blue-400" />
                  )}
                  <Icon name={icon} className="h-5 w-5" />
                  {label}
                  {to === "/budget" && budgetAlertCount > 0 && (
                    <span className="absolute right-1/2 top-1 h-1.5 w-1.5 translate-x-4 rounded-full bg-amber-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-300"
          >
            <Icon name="settings" className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      <Sheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <nav className="grid grid-cols-2 gap-2">
          {MORE_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-2.5 rounded-xl hb-card px-3.5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-blue-500/40"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400">
                <Icon name={icon} className="h-4 w-4" />
              </span>
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/health"
            onClick={() => setMoreOpen(false)}
            className="flex items-center gap-2.5 rounded-xl hb-card px-3.5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-blue-500/40"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400">
              <Icon name="health" className="h-4 w-4" />
            </span>
            Diagnostics
          </NavLink>
        </nav>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800/70 pt-4">
          <NavLink
            to="/login"
            onClick={() => setMoreOpen(false)}
            className="flex items-center justify-center gap-2 rounded-xl hb-btn-soft px-3 py-2.5 text-sm text-slate-300"
          >
            <Icon name="login" className="h-4 w-4" />
            Sign in
          </NavLink>
          <NavLink
            to="/setup"
            onClick={() => setMoreOpen(false)}
            className="flex items-center justify-center gap-2 rounded-xl hb-btn-soft px-3 py-2.5 text-sm text-slate-300"
          >
            <Icon name="user-plus" className="h-4 w-4" />
            New account
          </NavLink>
        </div>
        <button
          type="button"
          onClick={() => {
            setMoreOpen(false);
            setHelpOpen(true);
          }}
          className="mt-2 w-full rounded-xl hb-btn-soft px-3 py-2.5 text-sm text-slate-400"
        >
          Keyboard shortcuts
        </button>
      </Sheet>

      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        shellAlerts={shellAlerts}
      />
      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
