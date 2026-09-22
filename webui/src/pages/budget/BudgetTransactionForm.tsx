import { useEffect, useRef, useState } from "react";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { memberPickerLabel } from "../../lib/memberDisplay";
import { useMerchantSuggestions } from "../../hooks/useMerchantSuggestions";
import { defaultTransactionDateForMonth } from "../../lib/budgetTransactionDate";
import { formatMoney, isDepositAccount } from "../../lib/budgetMoney";
import { parseReceiptText } from "../../lib/receiptOcr";
import {
  postBudgetTransaction,
  postBudgetTransfer,
  type BudgetAccount,
  type BudgetCategory,
  type BudgetSplitInput,
} from "../../api";
import AccountSelect from "./AccountSelect";
import CategorySelect from "./CategorySelect";
import MerchantSuggestInput from "./MerchantSuggestInput";
import TransferAmountFields from "./TransferAmountFields";
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
  const [formToAmount, setFormToAmount] = useState("");
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
  const [chargeOthers, setChargeOthers] = useState(false);
  const [shareDrafts, setShareDrafts] = useState<ShareChargeDraft[]>(() => [emptyShareChargeDraft()]);
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [paymentDrafts, setPaymentDrafts] = useState<SharePaymentDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { merchants, suggestion } = useMerchantSuggestions(token, formMerchant);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const depositAccounts = activeAccounts.filter((a) => isDepositAccount(a.accountType));
  const fromAccounts = formType === "transfer" || formType === "income" ? depositAccounts : activeAccounts;

  async function scanReceipt(file: File) {
    setOcrBusy(true);
    setOcrStatus("Reading receipt…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      try {
        const { data } = await worker.recognize(file);
        const guess = parseReceiptText(data.text);
        if (guess.amount) setFormAmount(guess.amount);
        if (guess.merchant) setFormMerchant((m) => m || guess.merchant!);
        if (guess.date) setFormDate(guess.date);
        setOcrStatus(
          guess.amount || guess.merchant
            ? `Found ${[guess.merchant, guess.amount ? `$${guess.amount}` : null, guess.date].filter(Boolean).join(" · ")} — check before saving.`
            : "Couldn't read the receipt — fill in manually."
        );
      } finally {
        await worker.terminate();
      }
    } catch {
      setOcrStatus("Receipt scan failed — fill in manually.");
    } finally {
      setOcrBusy(false);
    }
  }

  useEffect(() => {
    setFormDate(defaultTransactionDateForMonth(month));
  }, [month]);

  useEffect(() => {
    if (formType !== "income" && formType !== "transfer") return;
    const selected = accounts.find((a) => String(a.id) === formAccountId);
    if (selected && !isDepositAccount(selected.accountType)) setFormAccountId("");
  }, [formType, formAccountId, accounts]);

  function addSplitRow() {
    setSplits((s) => [...s, { categoryId: "", spentByUserId: actor, amount: "" }]);
  }

  const total = Number(formAmount) || 0;
  const splitSum = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const splitRemaining = total - splitSum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || !formAmount.trim()) return;
    setFormError(null);

    if (formType === "transfer") {
      if (!formAccountId || !transferToId || formAccountId === transferToId) return;
      await postBudgetTransfer(token, actor, {
        amountInput: formAmount.trim(),
        toAmountInput: formToAmount.trim() || undefined,
        fromAccountId: Number(formAccountId),
        toAccountId: Number(transferToId),
        transactionDate: formDate || undefined,
        note: formNote || undefined,
        merchant: formMerchant.trim() || undefined,
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

      let shareCharges = undefined as ReturnType<typeof toShareChargeInputs> | undefined;
      let sharePayments = undefined as ReturnType<typeof toSharePaymentInputs> | undefined;
      if (formType === "expense" && chargeOthers) {
        const err = shareChargeError(total, shareDrafts);
        if (err) {
          setFormError(err);
          return;
        }
        shareCharges = toShareChargeInputs(shareDrafts);
      }
      if (formType === "income" && isReimbursement) {
        const err = sharePaymentError(total, paymentDrafts);
        if (err) {
          setFormError(err);
          return;
        }
        sharePayments = toSharePaymentInputs(paymentDrafts);
      }

      await postBudgetTransaction(token, actor, {
        type: formType === "income" && isReimbursement ? "reimbursement" : formType,
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
        shareCharges,
        sharePayments,
      });
    }

    setFormAmount("");
    setFormToAmount("");
    setFormNote("");
    setFormReceiptUrl("");
    setFormMerchant("");
    setFormTags("");
    setUseSplits(false);
    setSplits([{ categoryId: "", spentByUserId: formSpender, amount: "" }]);
    setChargeOthers(false);
    setShareDrafts([emptyShareChargeDraft()]);
    setIsReimbursement(false);
    setPaymentDrafts([]);
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
        {depositAccounts.length >= 1 && activeAccounts.length >= 2 && typeButton("transfer", "Transfer", "bg-blue-700 text-white")}
      </div>
      {formType !== "transfer" && (
        <input
          required
          placeholder="Amount"
          inputMode="decimal"
          value={formAmount}
          onChange={(e) => setFormAmount(e.target.value)}
          className={FORM_INPUT_CLASS}
        />
      )}
      <label className="block w-full min-w-0 text-xs text-slate-400">
        Date
        <span className="ml-1 font-normal text-slate-500">(which month this counts toward)</span>
        <div className={DATE_FIELD_WRAP_CLASS}>
          <input
            type="date"
            required
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </div>
      </label>

      {formType === "transfer" ? (
        <div className="space-y-3">
          <TransferAmountFields
            paid={formAmount}
            received={formToAmount}
            onPaidChange={setFormAmount}
            onReceivedChange={setFormToAmount}
          />
          <p className="text-xs text-slate-500">
            Gift cards: pay $80 at Costco, DoorDash gets $100 — enter both. The extra $20 raises the DoorDash balance and is not income. Log DoorDash orders as expenses from that cash account.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="block text-xs text-slate-400">
              From (checking or savings)
              <AccountSelect
                className="mt-1"
                accounts={fromAccounts}
                value={formAccountId}
                onChange={setFormAccountId}
                placeholder="Choose account"
                required
              />
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
              <AccountSelect
                className="mt-1"
                accounts={activeAccounts.filter((a) => String(a.id) !== formAccountId)}
                value={transferToId}
                onChange={setTransferToId}
                placeholder="Choose account"
                required
              />
            </label>
          </div>
          {formAccountId && transferToId && (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-3 transition-all duration-300">
              {(() => {
                const from = accounts.find((a) => String(a.id) === formAccountId);
                const to = accounts.find((a) => String(a.id) === transferToId);
                const paid = Number(formAmount) || 0;
                const received = formToAmount.trim() ? Number(formToAmount) || 0 : paid;
                return (
                  <>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-slate-200">{from?.name}</p>
                      <p className="text-xs text-slate-500">
                        {from && from.currentBalance < 0 ? "−" : ""}${formatMoney(Math.abs(from?.currentBalance ?? 0))}
                      </p>
                      {paid > 0 && (
                        <p className={`mt-1 text-xs ${(from?.currentBalance ?? 0) - paid < 0 ? "text-rose-300" : "text-amber-300"}`}>
                          → {(from?.currentBalance ?? 0) - paid < 0 ? "−" : ""}$
                          {formatMoney(Math.abs((from?.currentBalance ?? 0) - paid))}
                        </p>
                      )}
                    </div>
                    <span className="text-xl text-cyan-400 transition-transform duration-300">→</span>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="truncate text-sm font-medium text-slate-200">{to?.name}</p>
                      <p className="text-xs text-slate-500">
                        {to && to.currentBalance < 0 ? "−" : ""}${formatMoney(Math.abs(to?.currentBalance ?? 0))}
                      </p>
                      {received > 0 && (
                        <p className={`mt-1 text-xs ${(to?.currentBalance ?? 0) + received < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                          → {(to?.currentBalance ?? 0) + received < 0 ? "−" : ""}$
                          {formatMoney(Math.abs((to?.currentBalance ?? 0) + received))}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          <MerchantSuggestInput
            placeholder="Where you bought it (e.g. Costco)"
            value={formMerchant}
            onChange={setFormMerchant}
            suggestions={merchants}
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
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
            <CategorySelect
              categories={categories}
              value={formCategoryId}
              onChange={setFormCategoryId}
              placeholder="Category (optional)"
            />
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
                        {memberPickerLabel(m)}
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
          {fromAccounts.length > 0 && (
            <AccountSelect
              accounts={fromAccounts}
              value={formAccountId}
              onChange={setFormAccountId}
              placeholder={formType === "income" ? "Checking or savings" : "Account (default)"}
              showBalance
            />
          )}
          <DiscordMemberSelect
            token={token}
            label="Who spent / received"
            value={formSpender}
            sharedRoster={roster}
            onPickUserId={setFormSpender}
          />
          {formType === "expense" && (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={chargeOthers}
                  onChange={(e) => setChargeOthers(e.target.checked)}
                />
                Others owe me part of this
              </label>
              {chargeOthers && (
                <BudgetExpenseShareEditor
                  total={total}
                  token={token}
                  roster={roster}
                  drafts={shareDrafts}
                  onChange={setShareDrafts}
                />
              )}
            </>
          )}
          {formType === "income" && (
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
                  incomeAmount={total}
                  drafts={paymentDrafts}
                  onChange={setPaymentDrafts}
                />
              )}
            </>
          )}
          <MerchantSuggestInput
            placeholder="Merchant"
            value={formMerchant}
            onChange={setFormMerchant}
            suggestions={merchants}
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          <div className="flex items-center gap-2">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void scanReceipt(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={ocrBusy}
              onClick={() => receiptInputRef.current?.click()}
              className="shrink-0 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              {ocrBusy ? "Scanning…" : "Scan receipt"}
            </button>
            {ocrStatus && <span className="text-xs text-slate-400">{ocrStatus}</span>}
          </div>
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
      {formType === "income" && depositAccounts.length === 0 && (
        <p className="text-xs text-amber-300">Income needs a checking or savings account.</p>
      )}
      {formError && <p className="text-sm text-rose-300">{formError}</p>}
      <button
        type="submit"
        disabled={
          !actor ||
          !formAmount.trim() ||
          (formType === "transfer"
            ? !formAccountId || !transferToId
            : !formSpender) ||
          (formType === "income" && depositAccounts.length === 0)
        }
        className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 py-2 font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
      >
        {formType === "transfer" ? "Transfer" : "Save"}
      </button>
    </form>
  );
}
