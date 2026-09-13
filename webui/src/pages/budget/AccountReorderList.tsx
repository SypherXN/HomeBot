import { type ReactNode, useRef, useState } from "react";
import { moveIdToTarget, orderChanged } from "../../lib/accountOrder";

type Props<T extends { id: number }> = {
  items: T[];
  enabled: boolean;
  listClassName: string;
  onReorder: (next: T[]) => void | Promise<void>;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
};

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden className="fill-current">
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="7" cy="13" r="1.2" />
    </svg>
  );
}

/** Drag-handle list that commits a new order on drop (no live-swap flicker). */
export default function AccountReorderList<T extends { id: number }>({
  items,
  enabled,
  listClassName,
  onReorder,
  renderItem,
}: Props<T>) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const draggingIdRef = useRef<number | null>(null);

  function handleFor(id: number) {
    if (!enabled) return null;
    return (
      <button
        type="button"
        draggable
        title="Drag to reorder"
        aria-label="Drag to reorder"
        className="shrink-0 cursor-grab touch-none px-1.5 py-2 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
        onClick={(e) => e.preventDefault()}
        onDragStart={(e) => {
          draggingIdRef.current = id;
          setDraggingId(id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(id));
        }}
        onDragEnd={() => {
          draggingIdRef.current = null;
          setDraggingId(null);
          setOverId(null);
        }}
      >
        <GripIcon />
      </button>
    );
  }

  return (
    <ul className={listClassName}>
      {items.map((item) => {
        const isOver = enabled && overId === item.id && draggingId !== item.id;
        return (
          <li
            key={item.id}
            data-account-id={item.id}
            onDragOver={(e) => {
              if (!enabled || draggingIdRef.current == null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overId !== item.id) setOverId(item.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = draggingIdRef.current;
              draggingIdRef.current = null;
              setDraggingId(null);
              setOverId(null);
              if (from == null) return;
              const next = moveIdToTarget(items, from, item.id);
              if (orderChanged(items, next)) void onReorder(next);
            }}
            className={isOver ? "rounded-lg ring-2 ring-cyan-500/70" : undefined}
            style={{ opacity: draggingId === item.id ? 0.45 : 1 }}
          >
            {renderItem(item, handleFor(item.id))}
          </li>
        );
      })}
    </ul>
  );
}
