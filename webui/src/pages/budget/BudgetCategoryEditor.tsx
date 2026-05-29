import { useState } from "react";
import {
  deleteBudgetCategory,
  patchBudgetCategory,
  postBudgetCategory,
  type BudgetCategory,
} from "../../api";

type Props = {
  token: string;
  actor: string;
  categories: BudgetCategory[];
  onSaved: () => Promise<void>;
};

export default function BudgetCategoryEditor({ token, actor, categories, onSaved }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editVisibility, setEditVisibility] = useState("household");
  const [editTax, setEditTax] = useState(false);

  function startEdit(c: BudgetCategory) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditVisibility(c.visibility === "personal" ? "personal" : "household");
    setEditTax(c.isTaxDeductible);
  }

  return (
    <div className="space-y-3">
      <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
        {categories.map((c) =>
          editingId === c.id ? (
            <li key={c.id} className="rounded border border-slate-700 bg-slate-950/60 p-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mb-2 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
              />
              <div className="mb-2 flex flex-wrap gap-2">
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value)}
                  className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                >
                  <option value="household">Household</option>
                  <option value="personal">Personal</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input type="checkbox" checked={editTax} onChange={(e) => setEditTax(e.target.checked)} />
                  Tax-deductible
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-blue-400"
                  onClick={async () => {
                    if (!actor || !editName.trim()) return;
                    await patchBudgetCategory(token, actor, c.id, {
                      name: editName.trim(),
                      visibility: editVisibility,
                      isTaxDeductible: editTax,
                    });
                    setEditingId(null);
                    await onSaved();
                  }}
                >
                  Save
                </button>
                <button type="button" className="text-xs text-slate-400" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
              <span>
                {c.name}
                {c.visibility === "personal" ? " (personal)" : ""}
                {c.isTaxDeductible ? " · tax" : ""}
              </span>
              {actor && (
                <span className="flex gap-2 text-xs">
                  <button type="button" className="text-blue-400" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-red-400"
                    onClick={async () => {
                      if (!confirm(`Delete category "${c.name}"?`)) return;
                      await deleteBudgetCategory(token, actor, c.id);
                      await onSaved();
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          )
        )}
      </ul>
      {actor && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            await postBudgetCategory(token, actor, { name: newName.trim() });
            setNewName("");
            await onSaved();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category"
            className="flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <button type="submit" className="rounded-lg bg-slate-700 px-4 py-2 text-white">
            Add
          </button>
        </form>
      )}
    </div>
  );
}
