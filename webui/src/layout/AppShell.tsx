import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getApiBaseUrl } from "../api";

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/health", label: "Health" },
  { to: "/buy", label: "Buy" },
  { to: "/wishlist", label: "Wishlist" },
  { to: "/money", label: "Money" },
  { to: "/calendar", label: "Calendar" },
  { to: "/undo", label: "Undo" },
  { to: "/settings", label: "Settings" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
  ].join(" ");
}

export default function AppShell() {
  const { token } = useAuth();
  const hasToken = token.trim().length > 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-800 bg-slate-900/80 md:w-52 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">HomeBot</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-block h-2 w-2 rounded-full ${hasToken ? "bg-emerald-500" : "bg-amber-500"}`}
                title={hasToken ? "API token set" : "No API token"}
              />
              API
            </div>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 px-2 pb-3 md:flex-col md:px-2">
          {nav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end ?? false} className={navClass}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-800 bg-slate-950/50 px-4 py-3 backdrop-blur">
          <p className="truncate text-xs text-slate-500">
            <span className="text-slate-400">Base URL</span>{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">{getApiBaseUrl()}</code>
          </p>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
