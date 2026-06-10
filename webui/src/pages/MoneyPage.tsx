import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { validActorId } from "../lib/validation";
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

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type UserOption = { value: string; label: string };

function memberOptions(members: DiscordGuildMember[]): UserOption[] {
  return members.map((m) => ({
    value: m.userId,
    label: `${m.displayName} (@${m.username})`,
  }));
}

function UserField({
  id,
  label,
  value,
  onChange,
  rosterOptions,
  manualHint,
  canActor,
  onPickActor,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rosterOptions: UserOption[];
  manualHint: string;
  canActor: boolean;
  onPickActor: () => void;
}) {
  const knownValues = new Set(rosterOptions.map((o) => o.value));
  const showExtraOption = value.length > 0 && !knownValues.has(value);

  if (rosterOptions.length > 0) {
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full hb-input px-3 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select…</option>
          {rosterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {showExtraOption && (
            <option value={value}>
              Other ({value})
            </option>
          )}
        </select>
        {canActor && (
          <button
            type="button"
            className="mt-1 text-xs text-blue-400 hover:underline"
            onClick={onPickActor}
          >
            Use actor (me)
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">
        {label} {manualHint}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        inputMode="numeric"
        placeholder="Discord user id"
        className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {canActor && (
        <button
          type="button"
          className="mt-1 text-xs text-blue-400 hover:underline"
          onClick={onPickActor}
        >
          Fill with actor (me)
        </button>
      )}
    </div>
  );
}

export default function MoneyPage() {
  const { token, actorUserId } = useAuth();
  const tok = token.trim();
  const actor = actorUserId.trim();
  const canAuth = tok.length > 0;
  const canActor = canAuth && validActorId(actor);
  const guildRoster = useDiscordGuildRoster(token);

  const rosterOptions = useMemo(() => {
    const r = guildRoster.data;
    if (r?.available && r.members.length > 0) return memberOptions(r.members);
    return [] as UserOption[];
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
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [editRow, setEditRow] = useState<MoneyTransactionListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [splitName, setSplitName] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [splitPaidBy, setSplitPaidBy] = useState("");
  const [splitOwedBy, setSplitOwedBy] = useState("");
  const [splitPercent, setSplitPercent] = useState("50");
  const [splitDesc, setSplitDesc] = useState("");
  const [splitNotes, setSplitNotes] = useState("");
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState("");
  const [expOwedBy, setExpOwedBy] = useState("");
  const [expSubmitting, setExpSubmitting] = useState(false);

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

  async function handleSplitSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAuth) return;
    const name = splitName.trim();
    const amount = splitAmount.trim();
    if (!name) {
      showBanner("err", "Expense name is required.");
      return;
    }
    if (!amount) {
      showBanner("err", "Amount is required.");
      return;
    }
    if (!splitPaidBy.trim() || !splitOwedBy.trim()) {
      showBanner("err", "Choose who paid and who owes (split share).");
      return;
    }
    if (splitPaidBy === splitOwedBy) {
      showBanner("err", "Paid by and owes (share) must be two different people.");
      return;
    }
    const pc = Math.min(100, Math.max(1, parseInt(splitPercent, 10) || 50));
    setSplitSubmitting(true);
    try {
      await postMoneyExpenseSplit(tok, {
        name,
        amountInput: amount,
        paidBy: splitPaidBy.trim(),
        owedBy: splitOwedBy.trim(),
        percent: pc,
        description: splitDesc.trim() || undefined,
        notes: splitNotes.trim() || undefined,
      });
      setSplitName("");
      setSplitAmount("");
      setSplitPaidBy("");
      setSplitOwedBy("");
      setSplitPercent("50");
      setSplitDesc("");
      setSplitNotes("");
      setListPage(0);
      showBanner("ok", "Split expense recorded.");
      try {
        const res = await getMoneyTransactions(tok, 0);
        setData(res);
      } catch {
        await loadList();
      }
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setSplitSubmitting(false);
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAuth) return;
    const amount = payAmount.trim();
    if (!amount) {
      showBanner("err", "Amount is required.");
      return;
    }
    if (!payFrom.trim() || !payTo.trim()) {
      showBanner("err", "Choose who paid and who received.");
      return;
    }
    if (payFrom === payTo) {
      showBanner("err", "From and to must be different people.");
      return;
    }
    setPaySubmitting(true);
    try {
      await postMoneyPayment(tok, {
        amountInput: amount,
        paidBy: payFrom.trim(),
        receivedBy: payTo.trim(),
      });
      setPayAmount("");
      setPayFrom("");
      setPayTo("");
      setListPage(0);
      showBanner("ok", "Payment recorded.");
      try {
        const res = await getMoneyTransactions(tok, 0);
        setData(res);
      } catch {
        await loadList();
      }
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleUndo() {
    if (!canActor) {
      showBanner("err", "Set actorUserId in Settings to use undo.");
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
      showBanner("err", "Set actorUserId in Settings to delete transactions.");
      return;
    }
    if (!window.confirm(`Delete transaction #${row.id} (${row.type})? This cannot be undone.`)) return;
    setDeleteBusyId(row.id);
    try {
      await deleteMoneyTransaction(tok, actor, row.id);
      showBanner("ok", "Transaction deleted.");
      await loadList();
    } catch (err) {
      showBanner("err", err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusyId(null);
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

  const totalPages =
    data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const rangeStart =
    data && data.items.length > 0 ? data.page * data.pageSize + 1 : 0;
  const rangeEnd = data ? data.page * data.pageSize + data.items.length : 0;

  /**
   * Exact Discord id string for roster lookup. JSON numbers cannot represent all snowflakes
   * (only up to 2^53−1 is exact), so prefer the server's `member-{id}` label or a known query id.
   */
  function snowflakeDigitsFromHouseholdLabel(label: string): string | null {
    const m = /^member-(\d+)$/.exec(label.trim());
    return m?.[1] ?? null;
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

  /** Discord display line from roster, or null if not in guild cache. */
  function primaryLabelFromRoster(idStr: string): string | null {
    const members = guildRoster.data?.members;
    if (!members?.length) return null;
    const mem = members.find((x) => x.userId === idStr);
    if (!mem) return null;
    const u = mem.username.trim();
    const nick = mem.displayName.trim();
    if (nick && u && nick.toLowerCase() !== u.toLowerCase()) {
      return `${nick} (@${u})`;
    }
    return u ? `@${u}` : nick || null;
  }

  /** Table cell: roster name + exact snowflake subline (never the rounded JSON id alone). */
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
    return (
      primaryLabelFromRoster(idStr) ??
      (name.trim() || memberLabel.trim() || `user-${idStr}`)
    );
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
    <div className="mx-auto min-w-0 max-w-5xl px-3 pb-10 sm:px-4">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Money</h1>
        <p className="mt-1 text-sm text-slate-400">
          All expenses use the percentage split model. Record payments when someone settles up.
        </p>
      </header>

      {banner && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-100"
              : "border-red-800/60 bg-red-950/40 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!canAuth && (
        <div className="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Add your API token in{" "}
          <Link to="/settings" className="font-medium text-amber-50 underline">
            Settings
          </Link>{" "}
          to load transactions.
        </div>
      )}

      {canAuth && !canActor && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          Set <strong className="text-slate-100">actorUserId</strong> in{" "}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>{" "}
          to delete rows from the ledger.
        </div>
      )}

      {rosterHint && <p className="mb-4 text-xs text-amber-200/90">{rosterHint}</p>}

      {canAuth && (
        <section className="mb-8 hb-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Balance between two people</h2>
          <p className="mt-1 text-sm text-slate-400">
            Net balance from all expenses and payments (same rules as Discord summary).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <UserField
              id="money-sum-u1"
              label="Person A"
              value={sumUser1}
              onChange={setSumUser1}
              rosterOptions={rosterOptions}
              manualHint="(user id)"
              canActor={canActor}
              onPickActor={() => setSumUser1(actor)}
            />
            <UserField
              id="money-sum-u2"
              label="Person B"
              value={sumUser2}
              onChange={setSumUser2}
              rosterOptions={rosterOptions}
              manualHint="(user id)"
              canActor={canActor}
              onPickActor={() => setSumUser2(actor)}
            />
          </div>
          <button
            type="button"
            className="mt-4 min-h-[44px] rounded-lg hb-btn-soft px-4 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            disabled={summaryLoading}
            onClick={() => void handleLoadSummary()}
          >
            {summaryLoading ? "Loading…" : "Show balance"}
          </button>
          {summaryError && (
            <p className="mt-2 text-sm text-red-300">{summaryError}</p>
          )}
          {summary && (
            <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              {summarySentence(summary)}
            </p>
          )}
        </section>
      )}

      {canAuth && canActor && (
        <section className="mb-8 hb-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">All balances (you)</h2>
          <p className="mt-1 text-sm text-slate-400">
            Non-zero net balances with everyone else in the ledger.
          </p>
          {allBalancesLoading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
          {allBalancesError ? <p className="mt-3 text-sm text-red-300">{allBalancesError}</p> : null}
          {allBalances && allBalances.balances.length === 0 && !allBalancesLoading ? (
            <p className="mt-3 text-sm text-slate-400">All settled up.</p>
          ) : null}
          {allBalances && allBalances.balances.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {allBalances.balances.map((b) => (
                <li
                  key={b.otherUserId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{b.otherMemberLabel}</span>
                  <span className={b.balance >= 0 ? "text-emerald-300" : "text-amber-300"}>
                    {b.balance >= 0 ? "+" : ""}
                    {formatMoney(b.balance)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="hb-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Simple expense</h2>
          <p className="mt-1 text-sm text-slate-400">One person paid; one person owes the full amount.</p>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setExpSubmitting(true);
                try {
                  await postMoneyExpense(tok, {
                    name: expName.trim(),
                    amountInput: expAmount.trim(),
                    paidBy: expPaidBy,
                    owedBy: expOwedBy,
                  });
                  setExpName("");
                  setExpAmount("");
                  setBanner({ kind: "ok", text: "Expense logged." });
                  await loadList();
                } catch (err) {
                  setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
                } finally {
                  setExpSubmitting(false);
                }
              })();
            }}
          >
            <input
              value={expName}
              onChange={(e) => setExpName(e.target.value)}
              placeholder="Description"
              className="w-full hb-input px-3 py-2.5 text-slate-100"
            />
            <input
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="Amount"
              className="w-full hb-input px-3 py-2.5 text-slate-100"
            />
            <UserField
              id="exp-paid"
              label="Paid by"
              value={expPaidBy}
              onChange={setExpPaidBy}
              rosterOptions={rosterOptions}
              manualHint="(user id)"
              canActor={canActor}
              onPickActor={() => setExpPaidBy(actor)}
            />
            <UserField
              id="exp-owed"
              label="Owes"
              value={expOwedBy}
              onChange={setExpOwedBy}
              rosterOptions={rosterOptions}
              manualHint="(user id)"
              canActor={canActor}
              onPickActor={() => setExpOwedBy(actor)}
            />
            <button
              type="submit"
              disabled={expSubmitting || !expName.trim() || !expAmount.trim() || !expPaidBy || !expOwedBy}
              className="min-h-[44px] rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              {expSubmitting ? "Saving…" : "Log expense"}
            </button>
          </form>
        </section>

        <section className="hb-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Add split expense</h2>
          <p className="mt-1 text-sm text-slate-400">
            Total bill × percent = amount stored as owed. Example: $100 at 50% → $50 owed.
          </p>
          <form onSubmit={(e) => void handleSplitSubmit(e)} className="mt-4 space-y-4">
            <div>
              <label htmlFor="split-name" className="mb-1 block text-xs font-medium text-slate-400">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                id="split-name"
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="split-amt" className="mb-1 block text-xs font-medium text-slate-400">
                Total amount <span className="text-red-400">*</span>
              </label>
              <input
                id="split-amt"
                value={splitAmount}
                onChange={(e) => setSplitAmount(e.target.value)}
                placeholder="e.g. 48 or 12.5+9.99"
                className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <UserField
                id="split-paid"
                label="Paid by"
                value={splitPaidBy}
                onChange={setSplitPaidBy}
                rosterOptions={rosterOptions}
                manualHint="(user id)"
                canActor={canActor}
                onPickActor={() => setSplitPaidBy(actor)}
              />
              <UserField
                id="split-owed"
                label="Owes (their share %)"
                value={splitOwedBy}
                onChange={setSplitOwedBy}
                rosterOptions={rosterOptions}
                manualHint="(user id)"
                canActor={canActor}
                onPickActor={() => setSplitOwedBy(actor)}
              />
            </div>
            <div>
              <label htmlFor="split-pct" className="mb-1 block text-xs font-medium text-slate-400">
                Percent of total (1–100)
              </label>
              <input
                id="split-pct"
                type="number"
                min={1}
                max={100}
                value={splitPercent}
                onChange={(e) => setSplitPercent(e.target.value)}
                className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:max-w-[160px]"
              />
            </div>
            <div>
              <label htmlFor="split-desc" className="mb-1 block text-xs font-medium text-slate-400">
                Description (optional)
              </label>
              <input
                id="split-desc"
                value={splitDesc}
                onChange={(e) => setSplitDesc(e.target.value)}
                className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="split-notes" className="mb-1 block text-xs font-medium text-slate-400">
                Notes (optional)
              </label>
              <textarea
                id="split-notes"
                value={splitNotes}
                onChange={(e) => setSplitNotes(e.target.value)}
                rows={2}
                className="w-full resize-y hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={splitSubmitting || !canAuth}
              className="min-h-[44px] rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {splitSubmitting ? "Saving…" : "Add split expense"}
            </button>
          </form>
        </section>

        <section className="hb-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Record payment</h2>
          <p className="mt-1 text-sm text-slate-400">
            Money moved from one person to another (settles part of the running balance).
          </p>
          <form onSubmit={(e) => void handlePaymentSubmit(e)} className="mt-4 space-y-4">
            <div>
              <label htmlFor="pay-amt" className="mb-1 block text-xs font-medium text-slate-400">
                Amount <span className="text-red-400">*</span>
              </label>
              <input
                id="pay-amt"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 25"
                className="w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <UserField
                id="pay-from"
                label="Paid by (from)"
                value={payFrom}
                onChange={setPayFrom}
                rosterOptions={rosterOptions}
                manualHint="(user id)"
                canActor={canActor}
                onPickActor={() => setPayFrom(actor)}
              />
              <UserField
                id="pay-to"
                label="Received by (to)"
                value={payTo}
                onChange={setPayTo}
                rosterOptions={rosterOptions}
                manualHint="(user id)"
                canActor={canActor}
                onPickActor={() => setPayTo(actor)}
              />
            </div>
            <button
              type="submit"
              disabled={paySubmitting || !canAuth}
              className="min-h-[44px] rounded-lg border border-emerald-700 bg-emerald-900/50 px-4 py-2.5 text-sm font-medium text-emerald-100 hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paySubmitting ? "Saving…" : "Record payment"}
            </button>
          </form>
        </section>
      </div>

      <section aria-labelledby="tx-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="tx-heading" className="text-lg font-semibold text-white">
            Transactions
          </h2>
          {canAuth && (
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={listLoading}
              className="min-h-[40px] rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {listLoading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>

        {listError && (
          <p className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {listError}
          </p>
        )}

        {listLoading && !data && canAuth && (
          <p className="py-8 text-center text-slate-400">Loading…</p>
        )}

        {data && data.totalCount === 0 && !listLoading && (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-10 text-center text-slate-400">
            No transactions yet.
          </p>
        )}

        {data && data.items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/80">
                  <th className="px-3 py-3 font-medium text-slate-300">Id</th>
                  <th className="px-3 py-3 font-medium text-slate-300">Type</th>
                  <th className="px-3 py-3 font-medium text-slate-300">Name</th>
                  <th className="px-3 py-3 font-medium text-slate-300">Amount</th>
                  <th className="px-3 py-3 font-medium text-slate-300">Paid by</th>
                  <th className="px-3 py-3 font-medium text-slate-300">Owed / to</th>
                  <th className="px-3 py-3 font-medium text-slate-300 w-[100px]"> </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const paid = moneyTableParticipant(row.paidByMemberLabel, row.paidBy);
                  const owed = moneyTableParticipant(row.owedByMemberLabel, row.owedBy);
                  return (
                  <tr key={row.id} className="border-b border-slate-800/80 hover:bg-slate-900/40">
                    <td className="px-3 py-3 font-mono text-slate-400">{row.id}</td>
                    <td className="px-3 py-3 capitalize">{row.type}</td>
                    <td className="px-3 py-3 font-medium text-white">{row.name}</td>
                    <td className="px-3 py-3 tabular-nums">${formatMoney(row.amount)}</td>
                    <td className="px-3 py-3">
                      <div>{paid.primary}</div>
                      <div className="font-mono text-xs text-slate-500">{paid.snowflake}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{owed.primary}</div>
                      <div className="font-mono text-xs text-slate-500">{owed.snowflake}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg hb-btn-soft px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={!canActor || deleteBusyId === row.id}
                          onClick={() => void handleDelete(row)}
                          className="rounded-lg border border-red-800/70 bg-red-950/40 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-950/70 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {deleteBusyId === row.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalCount > 0 && (
          <nav
            className="mt-6 flex min-w-0 flex-col items-stretch gap-4 border-t border-slate-800 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            aria-label="Transaction pages"
          >
            {rangeStart > 0 ? (
              <p className="min-w-0 space-y-1 text-center text-sm leading-snug text-slate-400 sm:max-w-[55%] sm:text-left">
                <span className="block break-words sm:inline">
                  Showing <strong className="text-slate-200">{rangeStart}</strong>–
                  <strong className="text-slate-200">{rangeEnd}</strong> of{" "}
                  <strong className="text-slate-200">{data.totalCount}</strong>
                </span>
                <span className="block text-xs text-slate-500 sm:text-sm">
                  Page {data.page + 1} of {totalPages} · {data.pageSize} per page
                </span>
              </p>
            ) : null}
            <div className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={!data.hasPrev || listLoading}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data.hasNext || listLoading}
                onClick={() => setListPage((p) => p + 1)}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg hb-btn-soft px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[100px] sm:flex-none sm:px-4"
              >
                Next
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-slate-500 sm:text-left sm:max-w-md">
                Undo reverts the latest logged action for your actor (money, buy, wishlist, calendar, etc.), not only
                this page.
              </p>
              <button
                type="button"
                disabled={!canActor || undoBusy || listLoading}
                onClick={() => void handleUndo()}
                className="min-h-[44px] shrink-0 rounded-lg border border-amber-700/80 bg-amber-950/40 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-950/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {undoBusy ? "Undoing…" : "Undo last action"}
              </button>
            </div>
          </nav>
        )}
      </section>

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center hb-overlay p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-white">Edit transaction #{editRow.id}</h3>
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
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-400"
                >
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
          </div>
        </div>
      )}
    </div>
  );
}
