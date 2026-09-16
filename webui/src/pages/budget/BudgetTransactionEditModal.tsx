import { useEffect, useState } from "react";
import MemberIdField from "../../components/MemberIdField";
import Sheet from "../../components/Sheet";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { memberPickerLabel } from "../../lib/memberDisplay";
import { isDepositAccount, isIncomeLikeType } from "../../lib/budgetMoney";
import { DATE_FIELD_WRAP_CLASS, FORM_INPUT_CLASS } from "../../lib/formField";
import { transferReceivedAmount } from "../../lib/budgetTransfer";
import AccountSelect from "./AccountSelect";
import CategorySelect from "./CategorySelect";
import TransferAmountFields from "./TransferAmountFields";
import { BudgetExpenseShareEditor, BudgetReimbursementEditor } from "./BudgetShareEditors";
import {
  draftsFromShareSummary,
  emptyShareChargeDraft,
  shareChargeError,
  sharePaymentError,
  toShareChargeInputs,
  toSharePaymentInputs,
  type ShareChargeDraft,
  type SharePaymentDraft,
} from "../../lib/budgetShares";
import {
  patchBudgetTransaction,
  type BudgetAccount,
  type BudgetCategory,
  type BudgetSplitInput,
  type BudgetTransactionListItem,
} from "../../api";

type SplitRow = { categoryId: string; spentByUserId: string; amount: string };

type Props = {
  open: boolean;
  row: BudgetTransactionListItem | null;
  token: string;
  actor: string;
  categories: BudgetCategory[];
  accounts: BudgetAccount[];
  roster: DiscordGuildRosterState;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function BudgetTransactionEditModal({
  open,
  row,
  token,
  actor,
  categories,
  accounts,
  roster,
  onClose,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spender, setSpender] = useState("");
  const [txDate, setTxDate] = useState("");
  const [merchant, setMerchant] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [useSplits, setUseSplits] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [accountId, setAccountId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chargeOthers, setChargeOthers] = useState(false);
  const [shareDrafts, setShareDrafts] = useState<ShareChargeDraft[]>(() => [emptyShareChargeDraft()]);
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [paymentDrafts, setPaymentDrafts] = useState<SharePaymentDraft[]>([]);

  useEffect(() => {
    if (!open || !row) return;
    setAmount(String(row.amount));
    setToAmount(row.type === "transfer" ? String(transferReceivedAmount(row)) : "");
    setCategoryId(row.categoryId != null ? String(row.categoryId) : "");
    setSpender(row.spentByUserId);
    setTxDate(row.transactionDate?.slice(0, 10) ?? "");
    setMerchant(row.merchant ?? "");
    setReceiptUrl(row.receiptUrl ?? "");
    setNote(row.note ?? "");
    setTags(row.tags.join(", "));
    setIsPending(row.isPending);
    const hasSplits = row.splits.length > 0;
    setUseSplits(hasSplits);
    setSplits(
      hasSplits
        ? row.splits.map((s) => ({
            categoryId: s.categoryId != null ? String(s.categoryId) : "",
            spentByUserId: s.spentByUserId ?? row.spentByUserId,
            amount: String(s.amount),
          }))
        : [{ categoryId: "", spentByUserId: row.spentByUserId, amount: "" }]
    );
    let nextFrom = row.accountId != null ? String(row.accountId) : "";
    if ((row.type === "income" || row.type === "reimbursement" || row.type === "transfer") && row.accountId != null) {
      const fromAcc = accounts.find((a) => a.id === row.accountId);
      if (fromAcc && !isDepositAccount(fromAcc.accountType)) nextFrom = "";
    }
    setAccountId(nextFrom);
    setTransferToId(row.transferToAccountId != null ? String(row.transferToAccountId) : "");
    const hadCharges = (row.shareSummary?.charges.length ?? 0) > 0;
    setChargeOthers(hadCharges);
    setShareDrafts(draftsFromShareSummary(row.shareSummary));
    const payments = row.shareSummary?.payments ?? [];
    setIsReimbursement(row.type === "reimbursement" || payments.length > 0);
    setPaymentDrafts(payments.map((p) => ({ chargeId: p.chargeId, amount: String(p.amount) })));
    setError(null);
  }, [open, row, accounts]);

  if (!open || !row) return null;

  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const depositAccounts = activeAccounts.filter((a) => isDepositAccount(a.accountType));
  const incomeLike = isIncomeLikeType(row.type);
  const accountChoices =
    incomeLike ? depositAccounts : row.type === "transfer" ? depositAccounts : activeAccounts;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setBusy(true);
    setError(null);
    try {
      let splitPayload: BudgetSplitInput[] | undefined;
      if (useSplits && row!.type === "expense") {
        splitPayload = splits
          .filter((s) => s.amount.trim())
          .map((s) => ({
            categoryId: s.categoryId ? Number(s.categoryId) : null,
            spentByUserId: s.spentByUserId || spender,
            amount: Number(s.amount) || 0,
          }));
        if (splitPayload.length === 0) splitPayload = undefined;
      }

      const hadCharges = (row!.shareSummary?.charges.length ?? 0) > 0;
      let shareCharges = undefined as ReturnType<typeof toShareChargeInputs> | undefined;
      if (row!.type === "expense") {
        if (chargeOthers) {
          const err = shareChargeError(Number(amount) || 0, shareDrafts);
          if (err) {
            setError(err);
            setBusy(false);
            return;
          }
          shareCharges = toShareChargeInputs(shareDrafts);
        } else if (hadCharges) {
          shareCharges = [];
        }
      }

      const hadPayments = (row!.shareSummary?.payments.length ?? 0) > 0;
      let sharePayments = undefined as ReturnType<typeof toSharePaymentInputs> | undefined;
      if (isIncomeLikeType(row!.type)) {
        if (isReimbursement) {
          const err = sharePaymentError(Number(amount) || 0, paymentDrafts);
          if (err) {
            setError(err);
            setBusy(false);
            return;
          }
          sharePayments = toSharePaymentInputs(paymentDrafts);
        } else if (hadPayments || row!.type === "reimbursement") {
          sharePayments = [];
        }
      }

      await patchBudgetTransaction(token, actor, row!.id, {
        amountInput: amount.trim(),
        categoryId: categoryId ? Number(categoryId) : undefined,
        spentByUserId: spender || undefined,
        transactionDate: txDate || undefined,
        merchant: merchant || undefined,
        receiptUrl: receiptUrl.trim() || null,
        note: note || undefined,
        isPending,
        clearedAt: isPending ? null : new Date().toISOString(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        splits: splitPayload,
        accountId:
          row!.type === "transfer"
            ? Number(accountId)
            : accountId
              ? Number(accountId)
              : undefined,
        transferToAccountId: row!.type === "transfer" && transferToId ? Number(transferToId) : undefined,
        transferToAmountInput: row!.type === "transfer" ? toAmount.trim() || amount.trim() : undefined,
        shareCharges,
        sharePayments,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Edit transaction" onClose={onClose}>
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          {row.type === "transfer" ? (
            <TransferAmountFields
              paid={amount}
              received={toAmount}
              onPaidChange={setAmount}
              onReceivedChange={setToAmount}
            />
          ) : (
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              required
              className="w-full hb-input px-3 py-2 text-slate-100"
            />
          )}
          <label className="block w-full min-w-0 text-xs text-slate-400">
            Date
            <span className="ml-1 font-normal text-slate-500">(which month this counts toward)</span>
            <div className={DATE_FIELD_WRAP_CLASS}>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className={FORM_INPUT_CLASS}
              />
            </div>
          </label>
          <MemberIdField
            token={token}
            value={spender}
            onChange={setSpender}
            label="Spender"
            sharedRoster={roster}
            actorId={actor}
          />
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Category"
          />
          {row.type === "transfer" && accounts.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-slate-400">
                From
                <AccountSelect
                  className="mt-1"
                  accounts={depositAccounts}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder="From (checking or savings)"
                  required
                />
              </label>
              <label className="block text-xs text-slate-400">
                To
                <AccountSelect
                  className="mt-1"
                  accounts={activeAccounts}
                  value={transferToId}
                  onChange={setTransferToId}
                  placeholder="To account"
                  required
                />
              </label>
            </div>
          )}
          {row.type !== "transfer" && accountChoices.length > 0 && (
            <AccountSelect
              accounts={accountChoices}
              value={accountId}
              onChange={setAccountId}
              placeholder={incomeLike ? "Checking or savings" : "Account (default)"}
            />
          )}
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant"
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          <input
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="Receipt URL"
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="w-full hb-input px-3 py-2 text-slate-100"
          />
          {row.type === "expense" && (
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={useSplits} onChange={(e) => setUseSplits(e.target.checked)} />
              Edit splits
            </label>
          )}
          {useSplits && row.type === "expense" && (
            <div className="space-y-2 rounded border border-slate-700 p-2">
              {(() => {
                const total = Number(amount) || 0;
                const sum = splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
                const remaining = total - sum;
                return total > 0 ? (
                  <p className={`text-xs ${Math.abs(remaining) > 0.005 ? "text-amber-300" : "text-emerald-300"}`}>
                    {Math.abs(remaining) > 0.005
                      ? `$${Math.abs(remaining).toFixed(2)} ${remaining > 0 ? "left to split" : "over-split"}`
                      : "Fully split"}
                  </p>
                ) : null;
              })()}
              {splits.map((s, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <select
                    value={s.categoryId}
                    onChange={(e) =>
                      setSplits((prev) => prev.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))
                    }
                    className="hb-input px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={s.amount}
                    onChange={(e) =>
                      setSplits((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                    }
                    placeholder="Amount"
                    className="hb-input px-2 py-1 text-xs text-slate-100"
                  />
                  <select
                    value={s.spentByUserId}
                    onChange={(e) =>
                      setSplits((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, spentByUserId: e.target.value } : x))
                      )
                    }
                    className="hb-input px-2 py-1 text-xs text-slate-100"
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
              <button
                type="button"
                className="text-xs text-blue-400"
                onClick={() => setSplits((prev) => [...prev, { categoryId: "", spentByUserId: spender, amount: "" }])}
              >
                + split line
              </button>
            </div>
          )}
          {row.type === "expense" && (
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
                  key={row.id}
                  total={Number(amount) || 0}
                  token={token}
                  roster={roster}
                  drafts={shareDrafts}
                  onChange={setShareDrafts}
                />
              )}
            </>
          )}
          {incomeLike && (
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
                  existingPayments={row.shareSummary?.payments ?? []}
                  drafts={paymentDrafts}
                  onChange={setPaymentDrafts}
                />
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={isPending} onChange={(e) => setIsPending(e.target.checked)} />
            Pending (not cleared)
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm text-slate-400">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !actor}
              className="rounded bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
    </Sheet>
  );
}
