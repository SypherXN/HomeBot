import { useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onDelete?: () => void;
  onEdit?: () => void;
  enabled?: boolean;
};

/**
 * Mobile swipe-left reveals Edit / Delete actions under the row.
 * Desktop users still use the inline buttons in children.
 */
export default function SwipeableRow({ children, onDelete, onEdit, enabled = true }: Props) {
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const open = offset < -48;

  if (!enabled || (!onDelete && !onEdit)) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex w-16 items-center justify-center bg-blue-700 text-xs font-semibold text-white"
          >
            Edit
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex w-16 items-center justify-center bg-red-700 text-xs font-semibold text-white"
          >
            Delete
          </button>
        )}
      </div>
      <div
        className="relative bg-slate-950/95 transition-transform dark:bg-slate-950/95"
        style={{ transform: `translateX(${offset}px)`, backgroundColor: "var(--hb-row-bg, #0b1020)" }}
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchMove={(e) => {
          if (startX.current == null) return;
          const dx = (e.touches[0]?.clientX ?? startX.current) - startX.current;
          setOffset(Math.max(-128, Math.min(0, dx)));
        }}
        onTouchEnd={() => {
          startX.current = null;
          setOffset((o) => (o < -48 ? -128 : 0));
        }}
        onClick={() => {
          if (open) setOffset(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
