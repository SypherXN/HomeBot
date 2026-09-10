import { useCallback, useEffect, useState } from "react";
import {
  deleteBudgetCategorizeRule,
  getBudgetCategories,
  getBudgetCategorizeRules,
  patchBudgetCategorizeRule,
  postBudgetCategorizeRule,
  type BudgetCategorizeRule,
} from "../../api";
import { titleCase } from "../../lib/titleCase";

type Props = {
  token: string;
};

export default function BudgetCategorizeRulesPanel({ token }: Props) {
  const tok = token.trim();
  const [rules, setRules] = useState<BudgetCategorizeRule[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [matchContains, setMatchContains] = useState("");
  const [matchField, setMatchField] = useState<"merchant" | "note">("merchant");
  const [categoryId, setCategoryId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editField, setEditField] = useState<"merchant" | "note">("merchant");
  const [editContains, setEditContains] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const load = useCallback(async () => {
    if (!tok) return;
    try {
      const [r, cats] = await Promise.all([getBudgetCategorizeRules(tok), getBudgetCategories(tok)]);
      setRules(Array.isArray(r?.rules) ? r.rules : []);
      setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [tok]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tok) {
    return <p className="text-sm text-slate-500">Sign in to manage budget auto-categorize rules.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {err ? <p className="text-red-300">{err}</p> : null}
      <ul className="space-y-1 text-slate-400">
        {rules.filter((r) => r.isActive).map((r) => (
          <li key={r.id} className="rounded border border-slate-800/80 px-2 py-2">
            {editId === r.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={editField}
                  onChange={(e) => setEditField(e.target.value as "merchant" | "note")}
                  className="hb-input px-2 py-1 text-slate-100"
                >
                  <option value="merchant">Merchant</option>
                  <option value="note">Note</option>
                </select>
                <input
                  value={editContains}
                  onChange={(e) => setEditContains(e.target.value)}
                  className="min-w-[8rem] flex-1 hb-input px-2 py-1 text-slate-100"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="hb-input px-2 py-1 text-slate-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:underline"
                  onClick={() => {
                    void patchBudgetCategorizeRule(tok, r.id, {
                      matchField: editField,
                      matchContains: editContains.trim(),
                      categoryId: parseInt(editCategory, 10),
                    }).then(() => {
                      setEditId(null);
                      return load();
                    });
                  }}
                >
                  Save
                </button>
                <button type="button" className="text-xs text-slate-400" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-200">
                  {titleCase(r.matchField)} contains &quot;{r.matchContains}&quot; → {titleCase(r.categoryName)}
                </span>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:underline"
                  onClick={() => {
                    setEditId(r.id);
                    setEditField(r.matchField === "note" ? "note" : "merchant");
                    setEditContains(r.matchContains);
                    setEditCategory(String(r.categoryId));
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:underline"
                  onClick={() => {
                    void deleteBudgetCategorizeRule(tok, r.id).then(load);
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-2">
        <select
          value={matchField}
          onChange={(e) => setMatchField(e.target.value as "merchant" | "note")}
          className="hb-input px-2 py-1.5 text-slate-100"
        >
          <option value="merchant">Merchant</option>
          <option value="note">Note</option>
        </select>
        <input
          value={matchContains}
          onChange={(e) => setMatchContains(e.target.value)}
          placeholder="contains text"
          className="min-w-[8rem] flex-1 hb-input px-2 py-1.5 text-slate-100"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="hb-input px-2 py-1.5 text-slate-100"
        >
          <option value="">Category…</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!matchContains.trim() || !categoryId}
          className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          onClick={() => {
            void postBudgetCategorizeRule(tok, {
              matchField,
              matchContains: matchContains.trim(),
              categoryId: parseInt(categoryId, 10),
            }).then(() => {
              setMatchContains("");
              return load();
            });
          }}
        >
          Add rule
        </button>
      </div>
    </div>
  );
}
