import { useEffect, type ReactNode } from "react";
import { Icon } from "./icons";

type Props = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes for the panel (e.g. width overrides on desktop). */
  panelClassName?: string;
};

/**
 * Shared modal host: bottom sheet on mobile, centered dialog on md+.
 * Overlay click and Escape close. Locks body scroll while open.
 */
export default function Sheet({ open, title, onClose, children, panelClassName = "" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 hb-overlay"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`hb-dialog p-4 sm:p-6 ${panelClassName}`}
      >
        <div className="hb-sheet-handle" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <Icon name="x" className="h-4.5 w-4.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
