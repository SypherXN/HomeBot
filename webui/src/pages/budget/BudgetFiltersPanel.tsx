import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";

export type BudgetFilters = {
  merchant: string;
  noteContains: string;
  amountMin: string;
  amountMax: string;
  tag: string;
};

type Props = {
  token: string;
  roster: DiscordGuildRosterState;
  spenderFilter: string;
  onSpenderFilter: (v: string) => void;
  filters: BudgetFilters;
  onFiltersChange: (f: BudgetFilters) => void;
  allTags: string[];
  onApply: () => void;
  onClear: () => void;
};

export default function BudgetFiltersPanel({
  token,
  roster,
  spenderFilter,
  onSpenderFilter,
  filters,
  onFiltersChange,
  allTags,
  onApply,
  onClear,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Search & filters</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DiscordMemberSelect
          token={token}
          label="Spender"
          value={spenderFilter}
          sharedRoster={roster}
          onPickUserId={onSpenderFilter}
        />
        <div>
          <label className="mb-1 block text-xs text-slate-400">Merchant contains</label>
          <input
            value={filters.merchant}
            onChange={(e) => onFiltersChange({ ...filters, merchant: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Note contains</label>
          <input
            value={filters.noteContains}
            onChange={(e) => onFiltersChange({ ...filters, noteContains: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Min amount</label>
          <input
            value={filters.amountMin}
            onChange={(e) => onFiltersChange({ ...filters, amountMin: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Max amount</label>
          <input
            value={filters.amountMax}
            onChange={(e) => onFiltersChange({ ...filters, amountMax: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Tag</label>
          <input
            list="budget-tag-suggestions"
            value={filters.tag}
            onChange={(e) => onFiltersChange({ ...filters, tag: e.target.value })}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <datalist id="budget-tag-suggestions">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
