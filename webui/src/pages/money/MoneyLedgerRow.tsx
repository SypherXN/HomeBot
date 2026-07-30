import SwipeableRow from "../../components/SwipeableRow";
import { layerForAssignee } from "../../lib/personLayers";
import { formatMoney, MONEY_TEXT } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";
import type { MoneyTransactionListItem } from "../../api";

type Participant = { primary: string; snowflake: string };

type Props = {
  row: MoneyTransactionListItem;
  actor: string;
  canActor: boolean;
  participantFor: (memberLabel: string, userId: string | number) => Participant;
  onEdit: () => void;
  onDelete: () => void;
};

function shortLabel(p: Participant, actor: string): string {
  if (p.snowflake === actor) return "you";
  // "Nick (@user)" → "Nick"; "@user" stays
  return p.primary.replace(/\s*\(@[^)]+\)$/, "");
}

/** Splitwise feed row: type icon, name, "A → B", signed colored amount. */
export default function MoneyLedgerRow({ row, actor, canActor, participantFor, onEdit, onDelete }: Props) {
  const paid = participantFor(row.paidByMemberLabel, row.paidBy);
  const owed = participantFor(row.owedByMemberLabel, row.owedBy);
  const isPayment = row.type.toLowerCase().includes("payment");
  const involvesMe = paid.snowflake === actor || owed.snowflake === actor;
  const iReceive = isPayment ? owed.snowflake === actor : paid.snowflake === actor;

  const amountTone = !involvesMe ? "text-slate-300" : iReceive ? "text-emerald-300" : "text-amber-300";
  const sign = !involvesMe ? "" : iReceive ? "+" : "−";

  return (
    <SwipeableRow enabled={canActor} onEdit={onEdit} onDelete={onDelete}>
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
            isPayment ? "bg-emerald-950/50 text-emerald-300" : "bg-slate-800/70 text-slate-300"
          }`}
          aria-hidden
        >
          {isPayment ? "⇄" : "💸"}
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-slate-100">{titleCase(row.name)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${layerForAssignee(paid.snowflake).dot}`} aria-hidden />
              {shortLabel(paid, actor)}
            </span>
            <span aria-hidden>→</span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${layerForAssignee(owed.snowflake).dot}`} aria-hidden />
              {shortLabel(owed, actor)}
            </span>
            <span className="text-slate-600">· {isPayment ? "payment" : row.type}</span>
          </p>
          {(row.description || row.notes) && (
            <p className="mt-0.5 truncate text-xs text-slate-600">{row.description || row.notes}</p>
          )}
        </button>
        <span className={`${MONEY_TEXT} shrink-0 text-sm font-semibold ${amountTone}`}>
          {sign}${formatMoney(row.amount)}
        </span>
      </div>
    </SwipeableRow>
  );
}
