import { TOGGLEABLE_NAV_PAGES } from "../../lib/navConfig";
import { useNavVisibility } from "../../nav/NavVisibilityContext";

export default function NavigationPanel() {
  const { isVisible, setPageVisible } = useNavVisibility();

  const groups = [...new Set(TOGGLEABLE_NAV_PAGES.map((p) => p.group))];

  return (
    <div className="space-y-4 text-sm text-slate-300">
      <p className="text-slate-400">
        Choose which pages appear in the sidebar and mobile navigation. Hidden pages stay reachable from Settings and
        direct links are redirected home. Home, Settings, and Diagnostics always stay available.
      </p>
      {groups.map((group) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
          <ul className="space-y-2">
            {TOGGLEABLE_NAV_PAGES.filter((p) => p.group === group).map((page) => {
              const on = isVisible(page.id);
              return (
                <li
                  key={page.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100">{page.label}</p>
                    <p className="text-xs text-slate-500">{page.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Hide" : "Show"} ${page.label}`}
                    onClick={() => setPageVisible(page.id, !on)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-emerald-500/50 bg-emerald-950/50 text-emerald-200"
                        : "border-slate-600 bg-slate-800 text-slate-400"
                    }`}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
