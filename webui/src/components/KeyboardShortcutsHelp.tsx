type Props = {
  open: boolean;
  onClose: () => void;
};

const rows: { keys: string; action: string }[] = [
  { keys: "/", action: "Focus global search" },
  { keys: "?", action: "Show this help" },
  { keys: "Esc", action: "Close help / blur search" },
  { keys: "g then h", action: "Go to Home" },
  { keys: "g then b", action: "Go to Buy list" },
  { keys: "g then w", action: "Go to Wishlist" },
  { keys: "g then m", action: "Go to Money" },
  { keys: "g then c", action: "Go to Calendar" },
  { keys: "g then s", action: "Go to Settings" },
  { keys: "n", action: "Focus add form (Buy / Wishlist pages)" },
];

export default function KeyboardShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center hb-overlay p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-help-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="kbd-help-title" className="text-lg font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            Esc
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4">
              <kbd className="shrink-0 hb-input px-2 py-0.5 font-mono text-xs text-slate-200">
                {row.keys}
              </kbd>
              <span className="text-right text-slate-400">{row.action}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">Shortcuts are disabled while typing in a field.</p>
      </div>
    </div>
  );
}
