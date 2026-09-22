import { useEffect, useRef, useState } from "react";
import { defaultTransactionDateForMonth } from "../../lib/budgetTransactionDate";
import { isDepositAccount } from "../../lib/budgetMoney";
import AccountSelect from "./AccountSelect";
import CategorySelect from "./CategorySelect";
import MerchantSuggestInput from "./MerchantSuggestInput";
import { postBudgetTransaction, type BudgetAccount, type BudgetCategory } from "../../api";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { useMerchantSuggestions } from "../../hooks/useMerchantSuggestions";
import { BudgetExpenseShareEditor, BudgetReimbursementEditor } from "./BudgetShareEditors";
import { DATE_FIELD_WRAP_CLASS, FORM_INPUT_CLASS } from "../../lib/formField";
import {
  emptyShareChargeDraft,
  shareChargeError,
  sharePaymentError,
  toShareChargeInputs,
  toSharePaymentInputs,
  type ShareChargeDraft,
  type SharePaymentDraft,
} from "../../lib/budgetShares";

export type QuickAddPrefill = { categoryId?: number; merchant?: string } | null;

type Props = {
  token: string;
  actor: string;
  month: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onSaved: () => Promise<void>;
  /** Optional prefill (e.g. "Log spend" from an envelope card). */
  prefill?: QuickAddPrefill;
  /** Called after a prefill has been consumed. */
  onPrefillConsumed?: () => void;
};

/**
 * One-line add for the common case: amount, merchant, category.
 * Expands for the full set of fields. Requires "Acting as" to be set.
 * Suggests the category from categorize rules / last purchase at that merchant.
 */
export default function BudgetQuickAdd({
  token,
  actor,
  month,
  categories,
  accounts,
  roster,
  onSaved,
  prefill,
  onPrefillConsumed,
}: Props) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [spender, setSpender] = useState(actor);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => defaultTransactionDateForMonth(month));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chargeOthers, setChargeOthers] = useState(false);
  const [shareDrafts, setShareDrafts] = useState<ShareChargeDraft[]>(() => [emptyShareChargeDraft()]);
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [paymentDrafts, setPaymentDrafts] = useState<SharePaymentDraft[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);

  const { merchants, suggestion } = useMerchantSuggestions(token, merchant);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.categoryId != null) setCategoryId(String(prefill.categoryId));
    if (prefill.merchant) setMerchant(prefill.merchant);
    amountRef.current?.focus();
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  useEffect(() => {
    if (type !== "income") return;
    const selected = accounts.find((a) => String(a.id) === accountId);
    if (selected && !isDepositAccount(selected.accountType)) setAccountId("");
  }, [type, accountId, accounts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !spender || !amount.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const total = Number(amount) || 0;
      let shareCharges = undefined as ReturnType<typeof toShareChargeInputs> | undefined;
      let sharePayments = undefined as ReturnType<typeof toSharePaymentInputs> | undefined;
      if (type === "expense" && chargeOthers) {
        const err = shareChargeError(total, shareDrafts);
        if (err) {
          setError(err);
          setBusy(false);
          return;
        }
        shareCharges = toShareChargeInputs(shareDrafts);
      }
      if (type === "income" && isReimbursement) {
        const err = sharePaymentError(total, paymentDrafts);
        if (err) {
          setError(err);
          setBusy(false);
          return;
        }
        sharePayments = toSharePaymentInputs(paymentDrafts);
      }
      await postBudgetTransaction(token, actor, {
        type: type === "income" && isReimbursement ? "reimbursement" : type,
        amountInput: amount.trim(),
        categoryId: categoryId ? Number(categoryId) : undefined,
        spentByUserId: spender,
        merchant: merchant.trim() || undefined,
        note: note.trim() || undefined,
        accountId: accountId ? Number(accountId) : undefined,
        transactionDate: date || undefined,
        shareCharges,
        sharePayments,
      });
      setAmount("");
      setMerchant("");
      setCategoryId("");
      setNote("");
      setExpanded(false);
      setChargeOthers(false);
      setShareDrafts([emptyShareChargeDraft()]);
      setIsReimbursement(false);
      setPaymentDrafts([]);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!actor) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        To add transactions, set <strong>Acting as</strong> (your Discord user) in Settings → Budget.
      </div>
    );
  }

  const showSuggestion = suggestion && String(suggestion.categoryId) !== categoryId;

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`px-3 py-2 text-sm ${type === "expense" ? "bg-amber-700 text-white" : "bg-slate-900/60 text-slate-400"}`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`px-3 py-2 text-sm ${type === "income" ? "bg-emerald-700 text-white" : "bg-slate-900/60 text-slate-400"}`}
          >
            Income
          </button>
        </div>
        <input
          ref={amountRef}
          required
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 hb-input px-3 py-2 text-slate-100"
        />
        <MerchantSuggestInput
          rootClassName="min-w-0 flex-1"
          placeholder="Merchant"
          value={merchant}
          onChange={setMerchant}
          suggestions={merchants}
          className="w-full hb-input px-3 py-2 text-slate-100"
        />
        <CategorySelect
          className="min-w-0 max-w-40"
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Category"
        />
        <button
          type="submit"
          disabled={
            busy ||
            !spender ||
            !amount.trim() ||
            (type === "income" &&
              accounts.every((a) => a.isActive === false || !isDepositAccount(a.accountType)))
          }
          className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-200"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      {showSuggestion && (
        <button
          type="button"
          onClick={() => setCategoryId(String(suggestion.categoryId))}
          className="rounded-full border border-blue-700/50 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70"
        >
          {suggestion.source === "rule" ? "Rule:" : "Last time:"} {suggestion.categoryName} — tap to apply
        </button>
      )}
      {type === "expense" && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={chargeOthers} onChange={(e) => setChargeOthers(e.target.checked)} />
            Others owe me part of this
          </label>
          {chargeOthers && (
            <BudgetExpenseShareEditor
              total={Number(amount) || 0}
              token={token}
              roster={roster}
              drafts={shareDrafts}
              onChange={setShareDrafts}
            />
          )}
        </>
      )}
      {type === "income" && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={isReimbursement}
              onChange={(e) => setIsReimbursement(e.target.checked)}
            />
            This is a reimbursement
          </label>
          {isReimbursement && (
            <BudgetReimbursementEditor
              token={token}
              incomeAmount={Number(amount) || 0}
              drafts={paymentDrafts}
              onChange={setPaymentDrafts}
            />
          )}
        </>
      )}
      {expanded && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-2">
          <DiscordMemberSelect
            token={token}
            label="Who spent / received"
            value={spender}
            sharedRoster={roster}
            onPickUserId={setSpender}
            className="min-w-0"
          />
          {accounts.filter((a) => a.isActive !== false && (type !== "income" || isDepositAccount(a.accountType))).length > 0 && (
            <AccountSelect
              className="min-w-0"
              accounts={accounts.filter(
                (a) => a.isActive !== false && (type !== "income" || isDepositAccount(a.accountType))
              )}
              value={accountId}
              onChange={setAccountId}
              placeholder={type === "income" ? "Checking or savings" : "Account (default)"}
              showBalance
            />
          )}
          <label className="block min-w-0 text-xs text-slate-400 sm:col-span-1">
            Date
            <div className={DATE_FIELD_WRAP_CLASS}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={FORM_INPUT_CLASS}
              />
            </div>
          </label>
          <label className="block min-w-0 text-xs text-slate-400 sm:col-span-1">
            Note
            <input
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`mt-1 ${FORM_INPUT_CLASS}`}
            />
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
