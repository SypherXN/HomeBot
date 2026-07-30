import SwipeableRow from "../../components/SwipeableRow";
import { layerForAssignee } from "../../lib/personLayers";
import { titleCase } from "../../lib/titleCase";
import type { BuyListItem } from "../../api";

function itemAge(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return null;
  if (days === 1) return "1 day old";
  return `${days} days old`;
}

type Props = {
  item: BuyListItem;
  canActor: boolean;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/** Reminders-style compact row: round check, name + badges, swipe right to buy, left for actions. */
export default function BuyItemRow({
  item,
  canActor,
  busy,
  selectMode,
  selected,
  onToggleSelect,
  onComplete,
  onEdit,
  onDelete,
}: Props) {
  const age = itemAge(item.createdAt);
  const layer = layerForAssignee(item.assignedTo != null ? String(item.assignedTo) : null);
  const hasDetails = Boolean(item.store || item.tags?.length || item.notes || item.assignedToMemberLabel);

  return (
    <SwipeableRow
      enabled={canActor && !selectMode}
      onSwipeRight={onComplete}
      swipeRightLabel="Bought"
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
        {selectMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${item.name}`}
            className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-600"
          />
        ) : (
          <button
            type="button"
            disabled={!canActor || busy}
            onClick={onComplete}
            aria-label={`Mark ${item.name} as bought`}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 text-transparent transition-colors hover:border-emerald-500 hover:bg-emerald-900/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6.5 5 9.5 10 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium leading-snug text-slate-100">{titleCase(item.name)}</span>
            {item.quantity && item.quantity !== "1" && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">
                ×{item.quantity}
              </span>
            )}
            {age && <span className="text-[11px] text-amber-400/90">{age}</span>}
          </div>
          {hasDetails && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {item.store && (
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-400">{item.store}</span>
              )}
              {item.tags?.map((t) => (
                <span key={t} className="rounded-full bg-slate-800/80 px-2 py-0.5 text-slate-400">
                  #{t}
                </span>
              ))}
              {item.assignedToMemberLabel && (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${layer.dot}`} aria-hidden />
                  {item.assignedToMemberLabel}
                </span>
              )}
            </div>
          )}
          {item.notes && <p className="mt-1 truncate text-xs text-slate-500">{item.notes}</p>}
        </button>
      </div>
    </SwipeableRow>
  );
}
