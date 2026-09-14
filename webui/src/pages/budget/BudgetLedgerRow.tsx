import { Fragment, type ReactNode } from "react";
import SwipeableRow from "../../components/SwipeableRow";
import type { BudgetTransactionListItem } from "../../api";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import { memberUsername } from "../../lib/memberDisplay";
import { layerForAssignee } from "../../lib/personLayers";
import { categoryDotStyle, formatMoney, MONEY_TEXT, isIncomeLikeType } from "../../lib/budgetMoney";
import { humanizeBudgetTxType } from "../../lib/budgetLedger";
import { formatTransferLedgerAmount, transferReceivedAmount } from "../../lib/budgetTransfer";
import { formatShareOwedByLabel, relatedShareLinks } from "../../lib/budgetShares";
import { titleCase } from "../../lib/titleCase";

type Props = {
  row: BudgetTransactionListItem;
  actor: string;
  roster: DiscordGuildRosterState;
  categoryColor?: string | null;
  categoryNameById?: Map<number, string>;
  accountName?: string | null;
  transferToName?: string | null;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onSplit?: () => void;
  onViewTransaction?: (transactionId: number, transactionDate?: string | null) => void;
};

function TypeTile({ type }: { type: string }) {
  const t = type.toLowerCase();
  const style =
    t === "income" || t === "reimbursement"
      ? "bg-emerald-950/70 text-emerald-300"
      : t === "transfer"
        ? "bg-cyan-950/70 text-cyan-300"
        : t === "opening_balance"
          ? "bg-slate-800/80 text-slate-300"
          : "bg-amber-950/60 text-amber-300";
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style}`}
      aria-hidden
    >
      {t === "income" || t === "reimbursement" ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 13V3M4 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : t === "transfer" ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : t === "opening_balance" ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2 6.5 8 3l6 3.5V13H2V6.5Z" strokeLinejoin="round" />
          <path d="M8 8v5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 3v10M4 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function amountTone(type: string, amount: number): string {
  const t = type.toLowerCase();
  if (isIncomeLikeType(t)) return "text-emerald-300";
  if (t === "transfer") return "text-cyan-300";
  if (t === "opening_balance") return amount < 0 ? "text-rose-300" : "text-slate-200";
  return "text-amber-300";
}

function amountPrefix(type: string, amount: number): string {
  const t = type.toLowerCase();
  if (isIncomeLikeType(t)) return "+";
  if (t === "transfer") return "";
  if (amount < 0) return "−";
  if (t === "expense") return "−";
  return "";
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M11.5 2.5 13.5 4.5 6 12H4v-2l7.5-7.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 4h10M6.5 4V3h3v1M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Feed-style transaction row aligned with Money / Buy lists. */
export default function BudgetLedgerRow({
  row,
  actor,
  roster,
  categoryColor,
  categoryNameById,
  accountName,
  transferToName,
  selected = false,
  onToggleSelect,
  onEdit,
  onDelete,
  onSplit,
  onViewTransaction,
}: Props) {
  const spenderLayer = layerForAssignee(row.spentByUserId);
  const spender = memberUsername(roster.data, row.spentByUserId, row.spentByMemberLabel);
  const typeLabel = humanizeBudgetTxType(row.type);
  const title = row.merchant?.trim() || (row.categoryName ? titleCase(row.categoryName) : typeLabel);
  const showCategoryChip = Boolean(row.categoryName && row.merchant?.trim());
  const canActor = Boolean(actor);
  const abs = Math.abs(row.amount);
  const prefix = amountPrefix(row.type, row.amount);
  const received = row.type === "transfer" ? transferReceivedAmount(row) : row.amount;
  const transferLabel =
    row.type === "transfer" ? formatTransferLedgerAmount(row.amount, received, formatMoney) : null;
  const meta: ReactNode[] = [];
  if (showCategoryChip) {
    meta.push(
      <span key="cat" className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full" style={categoryDotStyle(categoryColor)} aria-hidden />
        {titleCase(row.categoryName!)}
      </span>
    );
  }
  if (spender) {
    meta.push(
      <span key="who" className="inline-flex items-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${spenderLayer.dot}`} aria-hidden />
        {spender}
      </span>
    );
  }
  if (row.type === "transfer" && accountName && transferToName) {
    meta.push(
      <span key="xfer">
        {accountName} → {transferToName}
      </span>
    );
  } else if (row.type !== "transfer" && accountName) {
    meta.push(<span key="acct">{accountName}</span>);
  }
  if (row.type === "transfer" && Math.abs(received - row.amount) > 0.005) {
    const bonus = received - row.amount;
    meta.push(
      <span
        key="bonus"
        className={`rounded-full px-1.5 py-px text-[10px] font-medium ${
          bonus > 0 ? "bg-emerald-950/70 text-emerald-200" : "bg-rose-950/70 text-rose-200"
        }`}
      >
        {bonus > 0 ? `+$${formatMoney(bonus)} bonus` : `−$${formatMoney(Math.abs(bonus))} fee`}
      </span>
    );
  }
  if (row.isPending) {
    meta.push(
      <span key="pend" className="rounded-full bg-amber-950/70 px-1.5 py-px text-[10px] font-medium text-amber-200">
        Pending
      </span>
    );
  }
  const share = row.shareSummary;
  if (row.type === "expense" && share && share.owed > 0.005) {
    const markedReimbursed = (share.charges ?? []).some((c) => c.status === "reimbursed");
    if (share.remaining > 0.005) {
      meta.push(
        <span key="owed" className="rounded-full bg-violet-950/70 px-1.5 py-px text-[10px] font-medium text-violet-200">
          Owed ${formatMoney(share.remaining)}
        </span>
      );
    } else if (share.received > 0.005 || markedReimbursed) {
      meta.push(
        <span key="paidback" className="rounded-full bg-emerald-950/70 px-1.5 py-px text-[10px] font-medium text-emerald-200">
          {markedReimbursed && share.received <= 0.005 ? "Reimbursed" : "Paid back"}
        </span>
      );
    } else {
      meta.push(
        <span key="ignored" className="rounded-full bg-slate-800 px-1.5 py-px text-[10px] text-slate-400">
          Not collecting
        </span>
      );
    }
  }
  if (isIncomeLikeType(row.type) && share && share.payments.length > 0) {
    const names = [...new Set(share.payments.map((p) => formatShareOwedByLabel(p.owedByLabel)).filter(Boolean))];
    meta.push(
      <span key="reimb" className="rounded-full bg-emerald-950/70 px-1.5 py-px text-[10px] font-medium text-emerald-200">
        {names.length ? `From ${names.join(", ")}` : "Reimbursement"}
      </span>
    );
  }

  const { incomeIds, expenseIds } = relatedShareLinks(row);
  if (row.type === "expense" && row.categoryId == null) {
    meta.push(
      <span key="uncat" className="rounded-full bg-slate-800 px-1.5 py-px text-[10px] text-slate-400">
        Uncategorized
      </span>
    );
  }

  return (
    <SwipeableRow enabled={canActor} onEdit={onEdit} onDelete={onDelete}>
      <div className="budget-ledger-row group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-500/[0.08] sm:px-4 dark:hover:bg-white/[0.04]">
        {canActor && onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${title}`}
            className="h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
          />
        )}
        <TypeTile type={row.type} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEdit} className="w-full text-left">
            <p className="truncate text-sm font-medium text-slate-100">{title}</p>
            {meta.length > 0 && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                {meta.map((node, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-slate-700">·</span>}
                    {node}
                  </Fragment>
                ))}
              </p>
            )}
            {row.note && <p className="mt-0.5 truncate text-[11px] text-slate-600">{row.note}</p>}
            {row.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {row.tags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-800/80 px-2 py-px text-[10px] text-slate-400">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            {row.splits.length > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Split {row.splits.length} ways
                {categoryNameById
                  ? row.splits
                      .filter((s) => s.categoryId != null)
                      .map((s) => ` · ${categoryNameById.get(s.categoryId!) ?? "Uncategorized"}`)
                      .join("")
                  : ""}
              </p>
            )}
            {canActor && row.type === "expense" && onSplit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSplit();
                }}
                className="mt-1 text-[11px] text-violet-400 hover:text-violet-200 sm:hidden"
              >
                Charge others
              </button>
            )}
            {onViewTransaction && row.type === "expense" && incomeIds.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-2 text-[11px]">
                {incomeIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewTransaction(id);
                    }}
                    className="text-blue-400 hover:text-blue-200"
                  >
                    View reimbursement
                  </button>
                ))}
              </p>
            )}
            {onViewTransaction && isIncomeLikeType(row.type) && expenseIds.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-2 text-[11px]">
                {expenseIds.map((id) => {
                  const pay = share?.payments.find((p) => p.expenseTransactionId === id);
                  const label = pay?.merchant?.trim() || pay?.expenseDate?.slice(0, 10) || "expense";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewTransaction(id, pay?.expenseDate);
                      }}
                      className="text-blue-400 hover:text-blue-200"
                    >
                      View {label}
                    </button>
                  );
                })}
              </p>
            )}
          </button>
          {row.receiptUrl && (
            <a
              href={row.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-[11px] text-blue-400 hover:underline"
            >
              Receipt
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canActor && (
            <span className="mr-0.5 hidden items-center sm:flex sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {row.type === "expense" && onSplit && (
                <button
                  type="button"
                  onClick={onSplit}
                  aria-label="Charge others"
                  title="Charge others"
                  className="rounded-lg px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-800 hover:text-violet-300"
                >
                  Split
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit transaction"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-blue-300"
              >
                <PencilIcon />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Delete transaction"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                >
                  <TrashIcon />
                </button>
              )}
            </span>
          )}
          <span className={`${MONEY_TEXT} text-sm font-semibold ${amountTone(row.type, row.amount)}`}>
            {transferLabel ? transferLabel : `${prefix}$${formatMoney(abs)}`}
          </span>
        </div>
      </div>
    </SwipeableRow>
  );
}
