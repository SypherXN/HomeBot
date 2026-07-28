import { useCallback, useRef, useState, type ReactNode } from "react";
import { ToastContext, type Toast, type ToastContextValue } from "./toastContext";

const DEFAULT_TIMEOUT = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (t: Omit<Toast, "id">, timeoutMs = DEFAULT_TIMEOUT) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      if (timeoutMs > 0) {
        timers.current.set(id, setTimeout(() => dismissToast(id), timeoutMs));
      }
      return id;
    },
    [dismissToast]
  );

  async function runAction(t: Toast) {
    if (!t.action) return;
    setToasts((ts) => ts.map((x) => (x.id === t.id ? { ...x, busy: true } : x)));
    try {
      await t.action.onAction();
    } finally {
      dismissToast(t.id);
    }
  }

  const value: ToastContextValue = { showToast, dismissToast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {toasts.map((t) => (
          <div key={t.id} className="hb-toast max-w-sm">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                t.kind === "success" ? "bg-emerald-400" : t.kind === "error" ? "bg-rose-400" : "bg-blue-400"
              }`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-sm text-slate-200">{t.message}</span>
            {t.action && (
              <button
                type="button"
                disabled={t.busy}
                onClick={() => void runAction(t)}
                className="shrink-0 rounded-lg bg-blue-600/80 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                {t.busy ? "…" : t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 text-slate-500 transition-colors hover:text-slate-300"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
