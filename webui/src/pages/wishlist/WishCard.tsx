import SwipeableRow from "../../components/SwipeableRow";
import { layerForAssignee } from "../../lib/personLayers";
import { titleCase } from "../../lib/titleCase";
import type { WishlistListItem } from "../../api";
import { linkDomain, priorityStars } from "./wishUtils";

type Props = {
  item: WishlistListItem;
  canActor: boolean;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onComplete: () => void;
  onAddToBuy: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/** Gift-registry-style card: stars + price up top, owner dot, link + add-to-buy actions. */
export default function WishCard({
  item,
  canActor,
  busy,
  selectMode,
  selected,
  onToggleSelect,
  onComplete,
  onAddToBuy,
  onEdit,
  onDelete,
}: Props) {
  const stars = priorityStars(item.priority);
  const domain = item.link ? linkDomain(item.link) : null;
  const layer = layerForAssignee(item.owner);
  const showOwner = Boolean(item.ownerMemberLabel && item.ownerMemberLabel !== item.owner);

  return (
    <SwipeableRow
      enabled={canActor && !selectMode}
      onSwipeRight={onComplete}
      swipeRightLabel="Got it"
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <div className="px-3 py-3 sm:px-4">
        <div className="flex items-start gap-3">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select ${item.name}`}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600"
            />
          )}
          <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {stars > 0 && (
                <span className="text-xs tracking-wide text-amber-400" aria-label={`Priority ${item.priority}`}>
                  {"★".repeat(stars)}
                  <span className="text-slate-700">{"★".repeat(3 - stars)}</span>
                </span>
              )}
              {item.price && (
                <span className="rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                  ${item.price.replace(/^\$+/, "")}
                </span>
              )}
              {showOwner && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${layer.dot}`} aria-hidden />
                  {item.ownerMemberLabel}
                </span>
              )}
            </div>
            <p className="mt-0.5 font-medium leading-snug text-slate-100">{titleCase(item.name)}</p>
            {item.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{item.description}</p>
            )}
            {(item.tags?.length || item.notes) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {item.tags?.map((t) => (
                  <span key={t} className="rounded-full bg-slate-800/80 px-2 py-0.5 text-slate-400">
                    #{t}
                  </span>
                ))}
                {item.notes && <span className="truncate">{item.notes}</span>}
              </div>
            )}
          </button>
        </div>

        {(item.link || canActor) && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-0">
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-blue-300 hover:border-blue-700 hover:text-blue-200"
              >
                {domain ?? "Open link"} ↗
              </a>
            )}
            {canActor && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAddToBuy}
                  className="rounded-lg border border-sky-800/70 bg-sky-950/30 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-950/60 disabled:opacity-50"
                >
                  + Buy list
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onComplete}
                  className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50"
                >
                  Got it
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </SwipeableRow>
  );
}
