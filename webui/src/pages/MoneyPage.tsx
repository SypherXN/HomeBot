import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Sheet from "../components/Sheet";
import { useGuildRoster } from "../hooks/GuildRosterContext";
import { memberPickerLabel, lookupMemberUsername, snowflakeFromMemberLabel } from "../lib/memberDisplay";
import { validActorId } from "../lib/validation";
import { formatMoney } from "../lib/budgetMoney";
import {
  deleteMoneyTransaction,
  getMoneySummary,
  getMoneyTransactions,
  getMoneyBalances,
  patchMoneyTransaction,
  postMoneyExpense,
  postMoneyExpenseSplit,
  postMoneyPayment,
  postUndo,
  type DiscordGuildMember,
  type MoneySummary,
  type MoneyBalances,
  type MoneyTransactionListItem,
  type PagedMoneyTransactions,
} from "../api";
import MoneyBalancesHero from "./money/MoneyBalancesHero";
import MoneyExpenseSheet from "./money/MoneyExpenseSheet";
import MoneySettleSheet, { type SettlePrefill } from "./money/MoneySettleSheet";
import MoneyLedgerRow from "./money/MoneyLedgerRow";
import MoneyUserField, { type MoneyUserOption } from "./money/MoneyUserField";

function memberOptions(members: DiscordGuildMember[]): MoneyUserOption[] {
  return members.map((m) => ({
    value: m.userId,
    label: memberPickerLabel(m),
  }));
}

export default function MoneyPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useGuildRoster();

  const rosterOptions = useMemo(() => {
    const r = guildRoster.data;
    if (r?.available && r.members.length > 0) return memberOptions(r.members);
    return [] as MoneyUserOption[];
  }, [guildRoster.data]);

  const rosterHint =
    guildRoster.data?.available === false
      ? "Discord roster unavailable — enter numeric Discord user ids for each person."
      : null;

  const [listPage, setListPage] = useState(0);
  const [data, setData] = useState<PagedMoneyTransactions | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [editRow, setEditRow] = useState<MoneyTransactionListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<SettlePrefill>(null);

  const [sumUser1, setSumUser1] = useState("");
  const [sumUser2, setSumUser2] = useState("");
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  /** Ids used for the last successful summary request (exact strings; avoids JSON number rounding). */
  const [summaryQueryIds, setSummaryQueryIds] = useState<{ u1: string; u2: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [allBalances, setAllBalances] = useState<MoneyBalances | null>(null);
  const [allBalancesLoading, setAllBalancesLoading] = useState(false);
  const [allBalancesError, setAllBalancesError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (!canAuth) {
      setData(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await getMoneyTransactions(tok, listPage);
      if (res.items.length === 0 && res.hasPrev) {
        setListPage((p) => Math.max(0, p - 1));
        return;
      }
      setData(res);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setListLoading(false);
    }
  }, [canAuth, tok, listPage]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!canActor) {
      setAllBalances(null);
      return;
    }
    setAllBalancesLoading(true);
    setAllBalancesError(null);
    void getMoneyBalances(tok, actor)
      .then(setAllBalances)
      .catch((e) => {
        setAllBalancesError(e instanceof Error ? e.message : String(e));
        setAllBalances(null);
      })
      .finally(() => setAllBalancesLoading(false));
  }, [canActor, tok, actor, data?.totalCount]);

  function showBanner(kind: "ok" | "err", text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }

  function labelForUserId(userId: string): string {
    const o = rosterOptions.find((x) => x.value === userId);
    return o?.label ?? `user-${userId}`;
  }

  async function refreshAfterMutation(message: string) {
    setListPage(0);
    showBanner("ok", message);
    try {
      const res = await getMoneyTransactions(tok, 0);
      setData(res);
    } catch {
      await loadList();
    }
  }

  async function handleExpenseSubmit(input: {
    name: string;
    amountInput: string;
    paidBy: string;
    owedBy: string;
    percent: number;
    description?: string;
    notes?: string;
  }) {
    try {
      if (input.percent >= 100) {
        await postMoneyExpense(tok, {
          name: input.name,
          amountInput: input.amountInput,
          paidBy: input.paidBy,
          owedBy: input.owedBy,
        });
      } else {
        await postMoneyExpenseSplit(tok, {
          name: input.name,
          amountInput: input.amountInput,
          paidBy: input.paidBy,
          owedBy: input.owedBy,
          percent: input.percent,
          description: input.description,
          notes: input.notes,
        });
      }
      await refreshAfterMutation("Expense recorded.");
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async function handleSettleSubmit(input: { amountInput: string; paidBy: string; receivedBy: string }) {
    try {
      await postMoneyPayment(tok, input);
      await refreshAfterMutation("Payment recorded.");
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  function openSettleFromBalance(otherUserId: string, _otherLabel: string, amount: number, direction: "they-pay" | "i-pay") {
    setSettlePrefill({
      from: direction === "they-pay" ? otherUserId : actor,
      to: direction === "they-pay" ? actor : otherUserId,
      amount: amount.toFixed(2),
    });
    setSettleOpen(true);
  }

  async function handleUndo() {
    if (!canActor) {
      showBanner("err", "Set “Acting as” in Settings to use undo.");
      return;
    }
    setUndoBusy(true);
    try {
      const r = await postUndo(tok, actor);
      if (!r.undone) {
        showBanner("err", (r.message && r.message.trim()) || "Nothing to undo for this actor.");
        return;
      }
      showBanner("ok", "Last action was undone.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setUndoBusy(false);
    }
  }

  function openEdit(row: MoneyTransactionListItem) {
    setEditRow(row);
    setEditName(row.name);
    setEditAmount(String(row.amount));
    setEditDesc(row.description ?? "");
    setEditNotes(row.notes ?? "");
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow || !canAuth) return;
    setEditBusy(true);
    try {
      await patchMoneyTransaction(tok, editRow.id, {
        name: editName.trim() || undefined,
        amountInput: editAmount.trim() || undefined,
        description: editDesc.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      showBanner("ok", "Transaction updated.");
      setEditRow(null);
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(row: MoneyTransactionListItem) {
    if (!canActor) {
      showBanner("err", "Set “Acting as” in Settings to delete transactions.");
      return;
    }
    try {
      await deleteMoneyTransaction(tok, actor, row.id);
      showBanner("ok", "Transaction deleted.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleLoadSummary() {
    if (!canAuth) return;
    const u1 = sumUser1.trim();
    const u2 = sumUser2.trim();
    if (!u1 || !u2) {
      setSummaryError("Pick both people.");
      setSummary(null);
      return;
    }
    if (u1 === u2) {
      setSummaryError("Pick two different people.");
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    setSummaryQueryIds(null);
    try {
      const name1 = labelForUserId(u1);
      const name2 = labelForUserId(u2);
      const s = await getMoneySummary(tok, u1, u2, name1, name2);
      setSummaryQueryIds({ u1, u2 });
      setSummary(s);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  const totalPages = data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const rangeStart = data && data.items.length > 0 ? data.page * data.pageSize + 1 : 0;
  const rangeEnd = data ? data.page * data.pageSize + data.items.length : 0;

  /**
   * Exact Discord id string for roster lookup. JSON numbers cannot represent all snowflakes
   * (only up to 2^53−1 is exact), so prefer the server's `member-{id}` label or a known query id.
   */
  function snowflakeDigitsFromHouseholdLabel(label: string): string | null {
    return snowflakeFromMemberLabel(label);
  }

  function exactSnowflakeForMoneyParticipant(
    memberLabel: string,
    apiUserId: string | number,
    preferredUserId?: string
  ): string {
    const fromForm = preferredUserId?.trim();
    if (fromForm && /^\d+$/.test(fromForm)) return fromForm;
    const fromLabel = snowflakeDigitsFromHouseholdLabel(memberLabel);
    if (fromLabel) return fromLabel;
    if (typeof apiUserId === "string" && /^\d+$/.test(apiUserId)) return apiUserId;
    return String(apiUserId);
  }

  /** Discord username from roster, or null if not in guild cache. */
  function primaryLabelFromRoster(idStr: string): string | null {
    return lookupMemberUsername(guildRoster.data, idStr, null);
  }

  /** Ledger row: roster name + exact snowflake (never the rounded JSON id alone). */
  function moneyTableParticipant(
    memberLabel: string,
    apiUserId: string | number
  ): { primary: string; snowflake: string } {
    const snowflake = exactSnowflakeForMoneyParticipant(memberLabel, apiUserId);
    const rostered = primaryLabelFromRoster(snowflake);
    return {
      primary: rostered ?? (memberLabel.trim() || `user-${snowflake}`),
      snowflake,
    };
  }

  /** Prefer guild roster Discord @username; otherwise API household labels. */
  function balanceDisplayName(
    userId: string | number,
    memberLabel: string,
    name: string,
    requestUserId?: string
  ): string {
    const idStr = exactSnowflakeForMoneyParticipant(memberLabel, userId, requestUserId);
    return primaryLabelFromRoster(idStr) ?? (name.trim() || memberLabel.trim() || `user-${idStr}`);
  }

  function summarySentence(s: MoneySummary): string {
    const q = summaryQueryIds;
    const a = balanceDisplayName(s.user1Id, s.user1MemberLabel, s.user1Name, q?.u1);
    const b = balanceDisplayName(s.user2Id, s.user2MemberLabel, s.user2Name, q?.u2);
    if (s.balance > 0) return `${b} owes ${a} $${formatMoney(s.balance)} (net).`;
    if (s.balance < 0) return `${a} owes ${b} $${formatMoney(Math.abs(s.balance))} (net).`;
    return `${a} and ${b} are settled up (net $0.00).`;
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4 px-3 pb-10 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Money</h1>
          <p className="mt-1 text-sm text-slate-400">Split expenses and settle up with the household.</p>
        </div>
        {canAuth && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSettlePrefill(null);
                setSettleOpen(true);
              }}
              className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-950/60"
            >
              ⇄ Settle up
            </button>
            <button
              type="button"
              onClick={() => setExpenseOpen(true)}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:from-blue-500 hover:to-blue-600"
            >
              + Expense
            </button>
          </div>
        )}
      </header>

      {banner && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!canAuth && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Sign in via{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to load the ledger.
        </div>
      )}

      {canAuth && !canActor && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          Set <strong className="text-slate-100">“Acting as”</strong> in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>{" "}
          to see your balances and delete rows.
        </div>
      )}

      {rosterHint && <p className="text-xs text-amber-200/90">{rosterHint}</p>}

      {canAuth && canActor && (
        <MoneyBalancesHero
          balances={allBalances}
          loading={allBalancesLoading}
          error={allBalancesError}
          onSettle={openSettleFromBalance}
        />
      )}

      {listError && (
        <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">{listError}</p>
      )}

      {listLoading && !data && canAuth && <p className="py-8 text-center text-slate-400">Loading…</p>}

      {data && data.totalCount === 0 && !listLoading && (
        <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-10 text-center text-sm text-slate-400">
          Nothing recorded yet — add an expense to get started.
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Ledger</h2>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={listLoading}
              className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {listLoading ? "…" : "Refresh"}
            </button>
          </div>
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
            {data.items.map((row) => (
              <li key={row.id}>
                <MoneyLedgerRow
                  row={row}
                  actor={actor}
                  canActor={canActor}
                  participantFor={moneyTableParticipant}
                  onEdit={() => openEdit(row)}
                  onDelete={() => void handleDelete(row)}
                />
              </li>
            ))}
          </ul>

          {data.totalCount > data.pageSize && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Transaction pages">
              <p className="text-xs text-slate-500">
                {rangeStart}–{rangeEnd} of {data.totalCount} · page {data.page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!data.hasPrev || listLoading}
                  onClick={() => setListPage((p) => Math.max(0, p - 1))}
                  className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  ← Newer
                </button>
                <button
                  type="button"
                  disabled={!data.hasNext || listLoading}
                  onClick={() => setListPage((p) => p + 1)}
                  className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  Older →
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {canAuth && (
        <details className="hb-card group p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-slate-300 marker:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Tools{" "}
            <span className="text-xs font-normal text-slate-500">pair balance, undo</span>
          </summary>

          <div className="mt-4 space-y-5 border-t border-slate-800 pt-4">
            <section aria-labelledby="pair-balance-heading">
              <h2 id="pair-balance-heading" className="text-sm font-semibold text-white">
                Balance between two people
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MoneyUserField
                  id="money-sum-u1"
                  label="Person A"
                  value={sumUser1}
                  onChange={setSumUser1}
                  rosterOptions={rosterOptions}
                  canActor={canActor}
                  onPickActor={() => setSumUser1(actor)}
                />
                <MoneyUserField
                  id="money-sum-u2"
                  label="Person B"
                  value={sumUser2}
                  onChange={setSumUser2}
                  rosterOptions={rosterOptions}
                  canActor={canActor}
                  onPickActor={() => setSumUser2(actor)}
                />
              </div>
              <button
                type="button"
                className="mt-3 rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-100 disabled:opacity-50"
                disabled={summaryLoading}
                onClick={() => void handleLoadSummary()}
              >
                {summaryLoading ? "Loading…" : "Show balance"}
              </button>
              {summaryError && <p className="mt-2 text-sm text-red-300">{summaryError}</p>}
              {summary && (
                <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
                  {summarySentence(summary)}
                </p>
              )}
            </section>

            <section aria-labelledby="money-maint-heading">
              <h2 id="money-maint-heading" className="text-sm font-semibold text-white">
                Maintenance
              </h2>
              <button
                type="button"
                disabled={!canActor || undoBusy || listLoading}
                onClick={() => void handleUndo()}
                title="Reverts the latest logged action for your actor (money, buy, wishlist, calendar…)"
                className="mt-2 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
              >
                {undoBusy ? "Undoing…" : "Undo last action"}
              </button>
            </section>
          </div>
        </details>
      )}

      <MoneyExpenseSheet
        open={expenseOpen}
        actor={actor}
        rosterOptions={rosterOptions}
        canActor={canActor}
        onClose={() => setExpenseOpen(false)}
        onSubmit={handleExpenseSubmit}
      />
      <MoneySettleSheet
        open={settleOpen}
        prefill={settlePrefill}
        actor={actor}
        rosterOptions={rosterOptions}
        canActor={canActor}
        onClose={() => setSettleOpen(false)}
        onSubmit={handleSettleSubmit}
      />

      {editRow && (
        <Sheet open title={`Edit transaction #${editRow.id}`} onClose={() => setEditRow(null)}>
          <form onSubmit={(e) => void handleEditSave(e)} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full hb-input px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Amount</label>
              <input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
                className="w-full hb-input px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Description</label>
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full hb-input px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full resize-y hb-input px-3 py-2 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditRow(null)} className="rounded-lg px-3 py-2 text-sm text-slate-400">
                Cancel
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {editBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
