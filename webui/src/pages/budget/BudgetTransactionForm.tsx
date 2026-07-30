import { useEffect, useState } from "react";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { useMerchantSuggestions } from "../../hooks/useMerchantSuggestions";
import { defaultTransactionDateForMonth } from "../../lib/budgetTransactionDate";
import {
  postBudgetTransaction,
  postBudgetTransfer,
  type BudgetAccount,
  type BudgetCategory,
  type BudgetSplitInput,
} from "../../api";

type SplitRow = { categoryId: string; spentByUserId: string; amount: string };

type Props = {
  token: string;
  actor: string;
  /** Budget month being viewed (YYYY-MM) — used to default the transaction date. */
  month: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onSaved: () => Promise<void>;
};

export default function BudgetTransactionForm({
  token,
  actor,
  month,
  categories,
  accounts,
  roster,
  onSaved,
}: Props) {
  const [formType, setFormType] = useState<"expense" | "income" | "transfer">("expense");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => defaultTransactionDateForMonth(month));
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formSpender, setFormSpender] = useState(actor);
  const [formNote, setFormNote] = useState("");
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [formMerchant, setFormMerchant] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formAccountId, setFormAccountId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [useSplits, setUseSplits] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([
    { categoryId: "", spentByUserId: actor, amount: "" },
  ]);

  const { merchants, suggestion } = useMerchantSuggestions(token, formMerchant);

  useEffect(() => {
    setFormDate(defaultTransactionDateForMonth(month));
  }, [month]);

  function addSplitRow() {
    setSplits((s) => [...s, { categoryId: "", spentByUserId: actor, amount: "" }]);
  }

  const total = Number(formAmount) || 0;
  const splitSum = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const splitRemaining = total - splitSum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !formAmount.trim()) return;

    if (formType === "transfer") {
      if (!formAccountId || !transferToId || formAccountId === transferToId) return;
      await postBudgetTransfer(token, actor, {
        amountInput: formAmount.trim(),
        fromAccountId: Number(formAccountId),
        toAccountId: Number(transferToId),
        transactionDate: formDate || undefined,
        note: formNote || undefined,
      });
    } else {
      if (!formSpender) return;
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
        transactionDate: formDate || undefined,
      });
    }

    setFormAmount("");
    setFormNote("");
    setFormReceiptUrl("");
    setFormMerchant("");
    setFormTags("");
    setUseSplits(false);
    setSplits([{ categoryId: "", spentByUserId: formSpender, amount: "" }]);
    await onSaved();
  }

  const typeButton = (id: "expense" | "income" | "transfer", label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => setFormType(id)}
      className={`flex-1 rounded-lg py-2 text-sm ${formType === id ? activeClass : "bg-slate-800 text-slate-400"}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div className="flex gap-2">
        {typeButton("expense", "Expense", "bg-amber-700 text-white")}
        {typeButton("income", "Income", "bg-emerald-700 text-white")}
        {accounts.length >= 2 && typeButton("transfer", "Transfer", "bg-blue-700 text-white")}
      </div>
      <input
        required
        placeholder="Amount"
        inputMode="decimal"
        value={formAmount}
        onChange={(e) => setFormAmount(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <label className="block text-xs text-slate-400">
        Date
        <span className="ml-1 font-normal text-slate-500">(which month this counts toward)</span>
        <input
          type="date"
          required
          value={formDate}
          onChange={(e) => setFormDate(e.target.value)}
          className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
        />
      </label>

      {formType === "transfer" ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="block text-xs text-slate-400">
              From
              <select
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
              >
                <option value="">Choose account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="hidden text-center text-2xl text-cyan-400 transition-transform duration-300 sm:block"
              style={{ transform: formAccountId && transferToId ? "scale(1.1)" : "scale(1)" }}
              aria-hidden
            >
              →
            </div>
            <label className="block text-xs text-slate-400">
              To
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
              >
                <option value="">Choose account</option>
                {accounts
                  .filter((a) => String(a.id) !== formAccountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {formAccountId && transferToId && (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-3 transition-all duration-300">
              {(() => {
                const from = accounts.find((a) => String(a.id) === formAccountId);
                const to = accounts.find((a) => String(a.id) === transferToId);
                const amt = Number(formAmount) || 0;
                return (
                  <>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-slate-200">{from?.name}</p>
                      <p className="text-xs text-slate-500">${from?.currentBalance.toFixed(2) ?? "0.00"}</p>
                      {amt > 0 && (
                        <p className="mt-1 text-xs text-amber-300 transition-opacity">
                          → ${Math.max(0, (from?.currentBalance ?? 0) - amt).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <span className="text-xl text-cyan-400 transition-transform duration-300">→</span>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-slate-200">{to?.name}</p>
                      <p className="text-xs text-slate-500">${to?.currentBalance.toFixed(2) ?? "0.00"}</p>
                      {amt > 0 && (
                        <p className="mt-1 text-xs text-emerald-300 transition-opacity">
                          → ${((to?.currentBalance ?? 0) + amt).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : (
        <>
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
          {suggestion && String(suggestion.categoryId) !== formCategoryId && !useSplits && (
            <button
              type="button"
              onClick={() => setFormCategoryId(String(suggestion.categoryId))}
              className="rounded-full border border-blue-700/50 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
            >
              {suggestion.source === "rule" ? "Rule:" : "Last time:"} {suggestion.categoryName} — tap to apply
            </button>
          )}
          {useSplits && formType === "expense" && (
            <div className="space-y-2 rounded-lg border border-slate-700 p-3">
              <p className={`text-xs ${Math.abs(splitRemaining) > 0.005 ? "text-amber-300" : "text-emerald-300"}`}>
                {total > 0
                  ? Math.abs(splitRemaining) > 0.005
                    ? `$${Math.abs(splitRemaining).toFixed(2)} ${splitRemaining > 0 ? "left to split" : "over-split"}`
                    : "Fully split"
                  : "Each line is a portion of the total (amounts should sum to the transaction)."}
              </p>
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
            list="budget-merchant-suggestions"
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          <datalist id="budget-merchant-suggestions">
            {merchants.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <input
            type="url"
            placeholder="Receipt URL (optional)"
            value={formReceiptUrl}
            onChange={(e) => setFormReceiptUrl(e.target.value)}
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
        </>
      )}
      <input
        placeholder="Note"
        value={formNote}
        onChange={(e) => setFormNote(e.target.value)}
        className="w-full hb-input px-3 py-2 text-slate-100"
      />
      <button
        type="submit"
        disabled={
          !actor ||
          !formAmount.trim() ||
          (formType === "transfer"
            ? !formAccountId || !transferToId
            : !formSpender)
        }
        className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 py-2 font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
      >
        {formType === "transfer" ? "Transfer" : "Save"}
      </button>
    </form>
  );
}
