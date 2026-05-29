import { useState } from "react";
import DiscordMemberSelect from "../../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import {
  patchBudgetBill,
  patchBudgetRecurring,
  postBudgetBill,
  postBudgetBillPay,
  postBudgetRecurring,
  type BudgetBill,
  type BudgetCategory,
  type BudgetRecurring,
} from "../../api";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  actor: string;
  categories: BudgetCategory[];
  roster: DiscordGuildRosterState;
  bills: BudgetBill[];
  recurring: BudgetRecurring[];
  defaultSpender: string;
  onSaved: () => Promise<void>;
};

export default function BudgetBillsRecurring({
  token,
  actor,
  categories,
  roster,
  bills,
  recurring,
  defaultSpender,
  onSaved,
}: Props) {
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDueDay, setBillDueDay] = useState("1");
  const [billCategory, setBillCategory] = useState("");

  const [recAmount, setRecAmount] = useState("");
  const [recCadence, setRecCadence] = useState("monthly");
  const [recNext, setRecNext] = useState(new Date().toISOString().slice(0, 10));
  const [recSpender, setRecSpender] = useState(defaultSpender);
  const [recCategory, setRecCategory] = useState("");
  const [payBillId, setPayBillId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const [editBillId, setEditBillId] = useState<number | null>(null);
  const [editBillName, setEditBillName] = useState("");
  const [editBillAmount, setEditBillAmount] = useState("");
  const [editBillDueDay, setEditBillDueDay] = useState("");
  const [editBillCategory, setEditBillCategory] = useState("");

  const [editRecId, setEditRecId] = useState<number | null>(null);
  const [editRecAmount, setEditRecAmount] = useState("");
  const [editRecCadence, setEditRecCadence] = useState("monthly");
  const [editRecNext, setEditRecNext] = useState("");
  const [editRecCategory, setEditRecCategory] = useState("");

  function startEditBill(b: BudgetBill) {
    setEditBillId(b.id);
    setEditBillName(b.name);
    setEditBillAmount(String(b.amountEstimate));
    setEditBillDueDay(String(b.dueDay));
    setEditBillCategory(b.categoryId != null ? String(b.categoryId) : "");
  }

  function startEditRec(r: BudgetRecurring) {
    setEditRecId(r.id);
    setEditRecAmount(String(r.amount));
    setEditRecCadence(r.cadence);
    setEditRecNext(r.nextRunDate);
    setEditRecCategory("");
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-4 text-lg font-medium text-white">Bills & recurring</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-300">Bills</h3>
          <ul className="mb-3 space-y-2 text-sm">
            {bills.length === 0 ? (
              <li className="text-slate-500">No active bills.</li>
            ) : (
              bills.map((b) => (
                <li key={b.id} className="rounded border border-slate-800 px-2 py-2">
                  {editBillId === b.id ? (
                    <div className="space-y-2">
                      <input
                        value={editBillName}
                        onChange={(e) => setEditBillName(e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                      />
                      <div className="flex gap-2">
                        <input
                          value={editBillAmount}
                          onChange={(e) => setEditBillAmount(e.target.value)}
                          placeholder="Amount"
                          className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                        />
                        <input
                          value={editBillDueDay}
                          onChange={(e) => setEditBillDueDay(e.target.value)}
                          placeholder="Due day"
                          className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                        />
                      </div>
                      <select
                        value={editBillCategory}
                        onChange={(e) => setEditBillCategory(e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                      >
                        <option value="">Category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-400"
                          onClick={async () => {
                            await patchBudgetBill(token, actor, b.id, {
                              name: editBillName.trim(),
                              amountEstimate: Number(editBillAmount) || 0,
                              dueDay: Number(editBillDueDay) || 1,
                              categoryId: editBillCategory ? Number(editBillCategory) : undefined,
                            });
                            setEditBillId(null);
                            await onSaved();
                          }}
                        >
                          Save
                        </button>
                        <button type="button" className="text-xs text-slate-400" onClick={() => setEditBillId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-300">
                        {b.name} · day {b.dueDay} · ~${formatMoney(b.amountEstimate)}
                      </span>
                      {actor && (
                        <span className="flex flex-wrap items-center gap-2">
                          {payBillId === b.id ? (
                            <>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                className="w-24 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                              />
                              <button
                                type="button"
                                className="text-xs text-emerald-400"
                                onClick={async () => {
                                  await postBudgetBillPay(token, actor, b.id, {
                                    amountInput: payAmount.trim() || String(b.amountEstimate),
                                    spentByUserId: defaultSpender,
                                  });
                                  setPayBillId(null);
                                  await onSaved();
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="text-xs text-slate-400"
                                onClick={() => setPayBillId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-emerald-400"
                              onClick={() => {
                                setPayBillId(b.id);
                                setPayAmount(String(b.amountEstimate));
                              }}
                            >
                              Pay
                            </button>
                          )}
                          <button type="button" className="text-xs text-blue-400" onClick={() => startEditBill(b)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-400"
                            onClick={async () => {
                              await patchBudgetBill(token, actor, b.id, { isActive: false });
                              await onSaved();
                            }}
                          >
                            Archive
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
          {actor && (
            <form
              className="space-y-2 border-t border-slate-800 pt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await postBudgetBill(token, actor, {
                  name: billName,
                  amountEstimate: Number(billAmount) || 0,
                  dueDay: Number(billDueDay) || 1,
                  categoryId: billCategory ? Number(billCategory) : undefined,
                });
                setBillName("");
                setBillAmount("");
                await onSaved();
              }}
            >
              <p className="text-xs text-slate-500">Add bill</p>
              <input
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Name"
                required
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
              <div className="flex gap-2">
                <input
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
                <input
                  value={billDueDay}
                  onChange={(e) => setBillDueDay(e.target.value)}
                  placeholder="Due day"
                  className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </div>
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded bg-slate-700 px-2 py-1 text-xs text-white">
                Add bill
              </button>
            </form>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-300">Recurring</h3>
          <ul className="mb-3 space-y-2 text-sm">
            {recurring.length === 0 ? (
              <li className="text-slate-500">No active recurring rules.</li>
            ) : (
              recurring.map((r) => (
                <li key={r.id} className="rounded border border-slate-800 px-2 py-2 text-slate-300">
                  {editRecId === r.id ? (
                    <div className="space-y-2">
                      <input
                        value={editRecAmount}
                        onChange={(e) => setEditRecAmount(e.target.value)}
                        placeholder="Amount"
                        className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                      />
                      <div className="flex gap-2">
                        <select
                          value={editRecCadence}
                          onChange={(e) => setEditRecCadence(e.target.value)}
                          className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                        <input
                          type="date"
                          value={editRecNext}
                          onChange={(e) => setEditRecNext(e.target.value)}
                          className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                        />
                      </div>
                      <select
                        value={editRecCategory}
                        onChange={(e) => setEditRecCategory(e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
                      >
                        <option value="">Category (optional)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-400"
                          onClick={async () => {
                            await patchBudgetRecurring(token, actor, r.id, {
                              amountInput: editRecAmount.trim(),
                              cadence: editRecCadence,
                              nextRunDate: editRecNext,
                              categoryId: editRecCategory ? Number(editRecCategory) : undefined,
                            });
                            setEditRecId(null);
                            await onSaved();
                          }}
                        >
                          Save
                        </button>
                        <button type="button" className="text-xs text-slate-400" onClick={() => setEditRecId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {r.type} ${formatMoney(r.amount)} · {r.cadence} · next {r.nextRunDate}
                      </span>
                      {actor && (
                        <span className="flex gap-2">
                          <button type="button" className="text-xs text-blue-400" onClick={() => startEditRec(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-400"
                            onClick={async () => {
                              await patchBudgetRecurring(token, actor, r.id, { isActive: false });
                              await onSaved();
                            }}
                          >
                            Pause
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
          {actor && (
            <form
              className="space-y-2 border-t border-slate-800 pt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await postBudgetRecurring(token, actor, {
                  amountInput: recAmount,
                  spentByUserId: recSpender,
                  categoryId: recCategory ? Number(recCategory) : undefined,
                  cadence: recCadence,
                  nextRunDate: recNext,
                  type: "expense",
                });
                setRecAmount("");
                await onSaved();
              }}
            >
              <p className="text-xs text-slate-500">Add recurring</p>
              <input
                value={recAmount}
                onChange={(e) => setRecAmount(e.target.value)}
                placeholder="Amount"
                required
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
              <DiscordMemberSelect
                token={token}
                label="Spender"
                value={recSpender}
                sharedRoster={roster}
                onPickUserId={setRecSpender}
              />
              <div className="flex gap-2">
                <select
                  value={recCadence}
                  onChange={(e) => setRecCadence(e.target.value)}
                  className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <input
                  type="date"
                  value={recNext}
                  onChange={(e) => setRecNext(e.target.value)}
                  className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </div>
              <select
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded bg-slate-700 px-2 py-1 text-xs text-white">
                Add recurring
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
