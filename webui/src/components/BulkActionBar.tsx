type Props = {
  count: number;
  busy?: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onClear: () => void;
  extra?: import("react").ReactNode;
};

export default function BulkActionBar({ count, busy, onComplete, onDelete, onClear, extra }: Props) {
  if (count <= 0) return null;

  return (
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-800/60 bg-blue-950/40 px-3 py-2 text-sm">
      <span className="font-medium text-blue-100">{count} selected</span>
      <button
        type="button"
        disabled={busy}
        onClick={onComplete}
        className="rounded-lg border border-emerald-700 bg-emerald-900/50 px-3 py-1.5 text-emerald-100 hover:bg-emerald-800/50 disabled:opacity-50"
      >
        Complete
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-red-200 hover:bg-red-900/50 disabled:opacity-50"
      >
        Remove
      </button>
      {extra}
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="ml-auto rounded-lg border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        Clear
      </button>
    </div>
  );
}
