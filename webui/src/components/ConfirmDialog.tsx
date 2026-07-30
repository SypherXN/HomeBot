import type { ReactNode } from "react";
import Sheet from "./Sheet";

type Props = {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/** In-app replacement for window.confirm — bottom sheet on mobile, dialog on desktop. */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Sheet open={open} title={title} onClose={busy ? () => undefined : onCancel}>
      {body ? <div className="mb-4 text-sm text-slate-300">{body}</div> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onConfirm()}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            danger
              ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600"
              : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600"
          }`}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
