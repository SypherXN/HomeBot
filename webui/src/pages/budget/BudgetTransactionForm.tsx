import { useState } from "react";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import {
  postBudgetTransaction,
  type BudgetAccount,
  type BudgetCategory,
  type BudgetSplitInput,
} from "../../api";

type SplitRow = { categoryId: string; spentByUserId: string; amount: string };

type Props = {
  token: string;
  actor: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onSaved: () => Promise<void>;
};

export default function BudgetTransactionForm({ token, actor, categories, accounts, roster, onSaved }: Props) {
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formAmount, setFormAmount] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formSpender, setFormSpender] = useState(actor);
  const [formNote, setFormNote] = useState("");
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [formMerchant, setFormMerchant] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formAccountId, setFormAccountId] = useState("");
  const [useSplits, setUseSplits] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([
    { categoryId: "", spentByUserId: actor, amount: "" },
  ]);

  function addSplitRow() {
    setSplits((s) => [...s, { categoryId: "", spentByUserId: actor, amount: "" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !formAmount.trim() || !formSpender) return;

    let splitPayload: BudgetSplitInput[] | undefined;
    if (useSplits && formType === "expense") {
      splitPayload = splits
        .filter((s) => s.amount.trim())
        .map((s) => ({
          categoryId: s.categoryId ? Number(s.categoryId) : null,
          spentByUserId: s.spentByUserId || formSpender,
          amount: Number(s.amount) || 0,
        }));
      if (splitPayload.length === 0) splitPayload = undefined;
    }

    await postBudgetTransaction(token, actor, {
      type: formType,
      amountInput: formAmount.trim(),
      categoryId: !useSplits && formCategoryId ? Number(formCategoryId) : undefined,
      spentByUserId: formSpender,
      note: formNote || undefined,
      receiptUrl: formReceiptUrl.trim() || undefined,
      merchant: formMerchant || undefined,
      tags: formTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      splits: splitPayload,
      currency: formCurrency.trim() || "USD",
      accountId: formAccountId ? Number(formAccountId) : undefined,
    });

    setFormAmount("");
    setFormNote("");
    setFormReceiptUrl("");
    setFormMerchant("");
    setFormTags("");
    setUseSplits(false);
    setSplits([{ categoryId: "", spentByUserId: formSpender, amount: "" }]);
    await onSaved();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFormType("expense")}
          className={`flex-1 rounded-lg py-2 text-sm ${formType === "expense" ? "bg-amber-700 text-white" : "bg-slate-800 text-slate-400"}`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setFormType("income")}
          className={`flex-1 rounded-lg py-2 text-sm ${formType === "income" ? "bg-emerald-700 text-white" : "bg-slate-800 text-slate-400"}`}
        >
          Income
        </button>
      </div>
      <input
        required
        placeholder="Amount"
        value={formAmount}
        onChange={(e) => setFormAmount(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      {formType === "expense" && (
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={useSplits} onChange={(e) => setUseSplits(e.target.checked)} />
          Split across categories / people
        </label>
      )}
      {!useSplits && (
        <select
          value={formCategoryId}
          onChange={(e) => setFormCategoryId(e.target.value)}
          className="w-full hb-input px-3 py-2 text-slate-100"
        >
          <option value="">Category (optional)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.visibility === "personal" ? " (personal)" : ""}
            </option>
          ))}
        </select>
      )}
      {useSplits && formType === "expense" && (
        <div className="space-y-2 rounded-lg border border-slate-700 p-3">
          <p className="text-xs text-slate-500">Each line is a portion of the total (amounts should sum to the transaction).</p>
          {splits.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              <input
                placeholder="Amount"
                value={row.amount}
                onChange={(e) => {
                  const next = [...splits];
                  next[i] = { ...next[i], amount: e.target.value };
                  setSplits(next);
                }}
                className="hb-input px-2 py-1 text-sm text-slate-100"
              />
              <select
                value={row.categoryId}
                onChange={(e) => {
                  const next = [...splits];
                  next[i] = { ...next[i], categoryId: e.target.value };
                  setSplits(next);
                }}
                className="hb-input px-2 py-1 text-sm text-slate-100"
              >
                <option value="">Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={row.spentByUserId}
                onChange={(e) => {
                  const next = [...splits];
                  next[i] = { ...next[i], spentByUserId: e.target.value };
                  setSplits(next);
                }}
                className="hb-input px-2 py-1 text-sm text-slate-100"
              >
                <option value="">Spender</option>
                {roster.data?.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" onClick={addSplitRow} className="text-xs text-blue-400 hover:underline">
            + Add split line
          </button>
        </div>
      )}
      {accounts.length > 0 && (
        <select
          value={formAccountId}
          onChange={(e) => setFormAccountId(e.target.value)}
          className="w-full hb-input px-3 py-2 text-slate-100"
        >
          <option value="">Account (default)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (${a.currentBalance.toFixed(2)})
            </option>
          ))}
        </select>
      )}
      <DiscordMemberSelect
        token={token}
        label="Who spent / received"
        value={formSpender}
        sharedRoster={roster}
        onPickUserId={setFormSpender}
      />
      <input
        placeholder="Merchant"
        value={formMerchant}
        onChange={(e) => setFormMerchant(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <input
        type="url"
        placeholder="Receipt URL (optional)"
        value={formReceiptUrl}
        onChange={(e) => setFormReceiptUrl(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <input
        placeholder="Note"
        value={formNote}
        onChange={(e) => setFormNote(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <input
        placeholder="Tags (comma-separated)"
        value={formTags}
        onChange={(e) => setFormTags(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <label className="block text-xs text-slate-400">
        Currency (3-letter)
        <input
          value={formCurrency}
          onChange={(e) => setFormCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          className="mt-1 w-24 hb-input px-3 py-2 text-slate-100 uppercase"
        />
      </label>
      <button
        type="submit"
        disabled={!actor || !formSpender}
        className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 py-2 font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
