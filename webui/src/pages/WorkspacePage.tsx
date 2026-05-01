import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import { validActorId } from "../lib/validation";
import {
  deleteCalendarItem,
  deleteMoneyTransaction,
  getApiBaseUrl,
  getCalendarItems,
  getCalendarToday,
  getCalendarUpcoming,
  getHealth,
  getMeta,
  getMoneySummary,
  getMoneyTransactions,
  patchCalendarItem,
  patchMoneyTransaction,
  postCalendarItem,
  postCalendarItemComplete,
  postMoneyExpense,
  postMoneyExpenseSplit,
  postMoneyPayment,
  postUndo,
} from "../api";

export type WorkspaceSection = "health" | "money" | "calendar" | "undo";

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export default function WorkspacePage({ section }: { section: WorkspaceSection }) {
  const { token, actorUserId } = useAuth();
  const [output, setOutput] = useState<string>(
    "Use the sidebar to switch domains. Health does not require a token."
  );
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState("");
  const [expOwedBy, setExpOwedBy] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [sum1, setSum1] = useState("");
  const [sum2, setSum2] = useState("");
  const [moneyEditId, setMoneyEditId] = useState("");
  const [moneyEditName, setMoneyEditName] = useState("");
  const [moneyEditAmount, setMoneyEditAmount] = useState("");
  const [moneyDelId, setMoneyDelId] = useState("");

  const [splitName, setSplitName] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [splitPaidBy, setSplitPaidBy] = useState("");
  const [splitOwedBy, setSplitOwedBy] = useState("");
  const [splitPercent, setSplitPercent] = useState("50");
  const [splitDesc, setSplitDesc] = useState("");
  const [splitNotes, setSplitNotes] = useState("");

  const [calTitle, setCalTitle] = useState("");
  const [calStart, setCalStart] = useState("");
  const [calAllDay, setCalAllDay] = useState(false);
  const [calEveryone, setCalEveryone] = useState(false);
  const [calAssigned, setCalAssigned] = useState("");
  const [calEnd, setCalEnd] = useState("");
  const [calReminder, setCalReminder] = useState("");
  const [calRecurrence, setCalRecurrence] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calNotes, setCalNotes] = useState("");
  const [calLink, setCalLink] = useState("");
  const [calActionId, setCalActionId] = useState("");
  const [calPatchId, setCalPatchId] = useState("");
  const [calPatchTitle, setCalPatchTitle] = useState("");
  const [calFilterUser, setCalFilterUser] = useState("");

  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const tok = token.trim();
  const guildRoster = useDiscordGuildRoster(token);
  const actor = actorUserId.trim();
  const requiresToken = section !== "health";
  const canRead = !requiresToken || tok.length > 0;
  /** Bearer only — enough for reads, money/calendar creates, some PATCH/DELETE. */
  const canAuth = tok.length > 0;
  /** Token + non-zero numeric actor — required where the API uses query actorUserId. */
  const canActor = canAuth && validActorId(actor);

  async function runRead() {
    if (!canRead) return;
    setLoading(true);
    try {
      let data: unknown;
      if (section === "health") {
        data = { health: await getHealth(), meta: await getMeta() };
      } else if (section === "money") {
        data = await getMoneyTransactions(tok, page);
      } else {
        data = await getCalendarItems(tok, page);
      }
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runCalendarToday() {
    if (!canRead) return;
    setLoading(true);
    try {
      const u = calFilterUser.trim();
      const data = await getCalendarToday(tok, page, u || undefined);
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runCalendarUpcoming() {
    if (!canRead) return;
    setLoading(true);
    try {
      const u = calFilterUser.trim();
      const data = await getCalendarUpcoming(tok, page, u || undefined);
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runMoneySummary() {
    if (!canRead) return;
    const u1 = sum1.trim();
    const u2 = sum2.trim();
    if (!/^\d+$/.test(u1) || !/^\d+$/.test(u2)) {
      setOutput("Enter two numeric user ids for summary (user1, user2).");
      return;
    }
    setLoading(true);
    try {
      const data = await getMoneySummary(tok, u1, u2);
      setOutput(formatJson(data));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doMutate(
    label: string,
    fn: () => Promise<unknown>,
    opts: { requireActor?: boolean } = {}
  ) {
    const needActor = opts.requireActor !== false;
    if (!canAuth) {
      setOutput("Set the API bearer token (HOMEBOT_API_TOKEN) first.");
      return;
    }
    if (needActor && !canActor) {
      setOutput(
        "This action needs actorUserId: your Discord user id (non-zero digits). Not required for money/calendar creates or some edits."
      );
      return;
    }
    setLoading(true);
    try {
      const data = await fn();
      setOutput(`${label}\n\n${formatJson(data)}`);
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hb-workspace">
      <p className="hb-hint mb-4">
        API base{" "}
        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">{baseUrl}</code>
      </p>

      {section === "health" && (
        <section className="hb-section">
          <button type="button" disabled={!canRead || loading} onClick={runRead}>
            {loading ? "…" : "GET /api/health + /api/meta"}
          </button>
        </section>
      )}

      {section === "money" && (
        <section className="hb-section">
          <h2>Transactions</h2>
          <div className="hb-row">
            <label htmlFor="page3">Page</label>
            <input
              id="page3"
              type="number"
              min={0}
              value={page}
              onChange={(e) => setPage(Math.max(0, Number(e.target.value) || 0))}
            />
            <button type="button" disabled={!canRead || loading} onClick={runRead}>
              GET /api/money/transactions
            </button>
          </div>

          <h2>Pairwise summary</h2>
          <div className="hb-grid2">
            <label>user1</label>
            <input value={sum1} onChange={(e) => setSum1(e.target.value)} />
            <label>user2</label>
            <input value={sum2} onChange={(e) => setSum2(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-4">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill user1"
              onPickUserId={setSum1}
              className="min-w-[200px]"
            />
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill user2"
              onPickUserId={setSum2}
              className="min-w-[200px]"
            />
          </div>
          <button type="button" disabled={!canRead || loading} onClick={() => void runMoneySummary()}>
            GET /api/money/summary
          </button>

          <h2>Add expense</h2>
          <p className="hb-hint">
            <strong>Required:</strong> name, amount, paidBy, owedBy (each a non-zero Discord user id).{" "}
            <strong>No actorUserId</strong> query on this route.
          </p>
          <div className="hb-grid2">
            <label>Name *</label>
            <input value={expName} onChange={(e) => setExpName(e.target.value)} />
            <label>amountInput *</label>
            <input value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="12.50" />
            <label>paidBy *</label>
            <input value={expPaidBy} onChange={(e) => setExpPaidBy(e.target.value)} placeholder="Discord user id" />
            <label>owedBy *</label>
            <input value={expOwedBy} onChange={(e) => setExpOwedBy(e.target.value)} placeholder="Discord user id" />
          </div>
          <div className="mb-3 flex flex-wrap gap-4">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill paidBy"
              onPickUserId={setExpPaidBy}
              className="min-w-[200px]"
            />
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill owedBy"
              onPickUserId={setExpOwedBy}
              className="min-w-[200px]"
            />
          </div>
          {canActor && (
            <div className="hb-btn-row">
              <button type="button" onClick={() => setExpPaidBy(actor)}>
                Use actor as paidBy
              </button>
              <button type="button" onClick={() => setExpOwedBy(actor)}>
                Use actor as owedBy
              </button>
            </div>
          )}
          <button
            type="button"
            className="hb-btn-primary"
            disabled={loading || !canAuth}
            onClick={() => {
              if (!expName.trim()) return setOutput("Enter expense name.");
              if (!expAmount.trim()) return setOutput("Enter amount (e.g. 12.50).");
              if (!expPaidBy.trim() || !expOwedBy.trim()) {
                return setOutput("Enter paidBy and owedBy as numeric Discord user ids.");
              }
              void doMutate(
                "POST /api/money/expenses",
                () =>
                  postMoneyExpense(tok, {
                    name: expName.trim(),
                    amountInput: expAmount.trim(),
                    paidBy: expPaidBy.trim(),
                    owedBy: expOwedBy.trim(),
                  }),
                { requireActor: false }
              );
            }}
          >
            POST /api/money/expenses
          </button>

          <h2>Split expense (%)</h2>
          <p className="hb-hint">
            Same as expense plus <strong>percent</strong> (1–100). Optional description/notes.
          </p>
          <div className="hb-grid2">
            <label>Name *</label>
            <input value={splitName} onChange={(e) => setSplitName(e.target.value)} />
            <label>amountInput *</label>
            <input value={splitAmount} onChange={(e) => setSplitAmount(e.target.value)} />
            <label>paidBy *</label>
            <input value={splitPaidBy} onChange={(e) => setSplitPaidBy(e.target.value)} />
            <label>owedBy *</label>
            <input value={splitOwedBy} onChange={(e) => setSplitOwedBy(e.target.value)} />
            <label>percent (1–100)</label>
            <input value={splitPercent} onChange={(e) => setSplitPercent(e.target.value)} />
            <label>Description (opt.)</label>
            <input value={splitDesc} onChange={(e) => setSplitDesc(e.target.value)} />
            <label>Notes (opt.)</label>
            <input value={splitNotes} onChange={(e) => setSplitNotes(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-4">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill paidBy"
              onPickUserId={setSplitPaidBy}
              className="min-w-[200px]"
            />
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill owedBy"
              onPickUserId={setSplitOwedBy}
              className="min-w-[200px]"
            />
          </div>
          {canActor && (
            <div className="hb-btn-row">
              <button type="button" onClick={() => setSplitPaidBy(actor)}>
                paidBy = actor
              </button>
              <button type="button" onClick={() => setSplitOwedBy(actor)}>
                owedBy = actor
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={loading || !canAuth}
            onClick={() => {
              if (!splitName.trim()) return setOutput("Enter split expense name.");
              if (!splitAmount.trim()) return setOutput("Enter amount.");
              if (!splitPaidBy.trim() || !splitOwedBy.trim()) {
                return setOutput("Enter paidBy and owedBy.");
              }
              const pc = Math.min(100, Math.max(1, parseInt(splitPercent, 10) || 50));
              void doMutate(
                "POST /api/money/expenses/split",
                () =>
                  postMoneyExpenseSplit(tok, {
                    name: splitName.trim(),
                    amountInput: splitAmount.trim(),
                    paidBy: splitPaidBy.trim(),
                    owedBy: splitOwedBy.trim(),
                    percent: pc,
                    description: splitDesc.trim() || undefined,
                    notes: splitNotes.trim() || undefined,
                  }),
                { requireActor: false }
              );
            }}
          >
            POST /api/money/expenses/split
          </button>

          <h2>Record payment</h2>
          <p className="hb-hint">
            <strong>Required:</strong> amount, paidBy, receivedBy. <strong>No actorUserId</strong> on this route.
          </p>
          <div className="hb-grid2">
            <label>amountInput *</label>
            <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <label>paidBy *</label>
            <input value={payFrom} onChange={(e) => setPayFrom(e.target.value)} />
            <label>receivedBy *</label>
            <input value={payTo} onChange={(e) => setPayTo(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-4">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill paidBy"
              onPickUserId={setPayFrom}
              className="min-w-[200px]"
            />
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill receivedBy"
              onPickUserId={setPayTo}
              className="min-w-[200px]"
            />
          </div>
          {canActor && (
            <div className="hb-btn-row">
              <button type="button" onClick={() => setPayFrom(actor)}>
                paidBy = actor
              </button>
              <button type="button" onClick={() => setPayTo(actor)}>
                receivedBy = actor
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={loading || !canAuth}
            onClick={() => {
              if (!payAmount.trim()) return setOutput("Enter amount.");
              if (!payFrom.trim() || !payTo.trim()) return setOutput("Enter paidBy and receivedBy.");
              void doMutate(
                "POST /api/money/payments",
                () =>
                  postMoneyPayment(tok, {
                    amountInput: payAmount.trim(),
                    paidBy: payFrom.trim(),
                    receivedBy: payTo.trim(),
                  }),
                { requireActor: false }
              );
            }}
          >
            POST /api/money/payments
          </button>

          <h2>Patch / delete transaction</h2>
          <p className="hb-hint">PATCH needs token only. DELETE needs <code>actorUserId</code> (same as other deletes).</p>
          <div className="hb-grid2">
            <label>Tx id</label>
            <input value={moneyEditId} onChange={(e) => setMoneyEditId(e.target.value)} />
            <label>Name</label>
            <input value={moneyEditName} onChange={(e) => setMoneyEditName(e.target.value)} />
            <label>amountInput</label>
            <input value={moneyEditAmount} onChange={(e) => setMoneyEditAmount(e.target.value)} />
          </div>
          <div className="hb-btn-row">
            <button
              type="button"
              disabled={loading || !canAuth}
              onClick={() => {
                const id = parseInt(moneyEditId, 10);
                if (!id) return setOutput("Enter tx id.");
                void doMutate(
                  "PATCH tx",
                  () =>
                    patchMoneyTransaction(tok, id, {
                      name: moneyEditName.trim() || undefined,
                      amountInput: moneyEditAmount.trim() || undefined,
                    }),
                  { requireActor: false }
                );
              }}
            >
              PATCH /api/money/transactions/{"{id}"}
            </button>
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(moneyDelId, 10);
                if (!id) return setOutput("Enter delete id below.");
                void doMutate("DELETE tx", () => deleteMoneyTransaction(tok, actor, id));
              }}
            >
              DELETE tx (needs actor)
            </button>
          </div>
          <div className="hb-grid2">
            <label>Delete id</label>
            <input value={moneyDelId} onChange={(e) => setMoneyDelId(e.target.value)} />
          </div>
        </section>
      )}

      {section === "calendar" && (
        <section className="hb-section">
          <h2>List / today / upcoming</h2>
          <div className="hb-row">
            <label htmlFor="page4">Page</label>
            <input
              id="page4"
              type="number"
              min={0}
              value={page}
              onChange={(e) => setPage(Math.max(0, Number(e.target.value) || 0))}
            />
            <button type="button" disabled={!canRead || loading} onClick={runRead}>
              GET /api/calendar/items
            </button>
          </div>
          <div className="hb-grid2">
            <label>userFilter (opt.)</label>
            <input value={calFilterUser} onChange={(e) => setCalFilterUser(e.target.value)} />
          </div>
          <div className="mb-3 max-w-xl">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Fill user filter"
              onPickUserId={setCalFilterUser}
            />
          </div>
          <div className="hb-btn-row">
            <button type="button" disabled={!canRead || loading} onClick={() => void runCalendarToday()}>
              GET /api/calendar/today
            </button>
            <button type="button" disabled={!canRead || loading} onClick={() => void runCalendarUpcoming()}>
              GET /api/calendar/upcoming
            </button>
          </div>

          <h2>Create item</h2>
          <p className="hb-hint">
            <strong>Required:</strong> title. <strong>Optional:</strong> start (natural language; empty = task), end,
            allDay, reminder (e.g. 10m, 2h), recurrence (<code>daily</code> or <code>weekly</code>), assignToEveryone,
            assignedToUserId, description, notes, link. <strong>No actorUserId</strong> on create.
          </p>
          <div className="hb-grid2">
            <label>Title *</label>
            <input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
            <label>Start (opt.)</label>
            <input value={calStart} onChange={(e) => setCalStart(e.target.value)} placeholder="empty = task; or e.g. tomorrow 6pm" />
            <label>End (opt.)</label>
            <input value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
            <label>Reminder (opt.)</label>
            <input value={calReminder} onChange={(e) => setCalReminder(e.target.value)} placeholder="10m, 2h, 1d" />
            <label>Recurrence (opt.)</label>
            <input value={calRecurrence} onChange={(e) => setCalRecurrence(e.target.value)} placeholder="daily or weekly" />
            <label className="check">
              <input type="checkbox" checked={calAllDay} onChange={(e) => setCalAllDay(e.target.checked)} />
              allDay
            </label>
            <span />
            <label className="check">
              <input type="checkbox" checked={calEveryone} onChange={(e) => setCalEveryone(e.target.checked)} />
              assignToEveryone
            </label>
            <span />
            <label>assignedToUserId (opt.)</label>
            <input value={calAssigned} onChange={(e) => setCalAssigned(e.target.value)} placeholder="ignored if assign everyone" />
            <label>Description (opt.)</label>
            <input value={calDesc} onChange={(e) => setCalDesc(e.target.value)} />
            <label>Notes (opt.)</label>
            <input value={calNotes} onChange={(e) => setCalNotes(e.target.value)} />
            <label>Link (opt.)</label>
            <input value={calLink} onChange={(e) => setCalLink(e.target.value)} />
          </div>
          <div className="mb-3 max-w-xl">
            <DiscordMemberSelect
              token={tok}
              sharedRoster={guildRoster}
              label="Assign to user (pick from server)"
              onPickUserId={setCalAssigned}
            />
          </div>
          <button
            type="button"
            className="hb-btn-primary"
            disabled={loading || !canAuth}
            onClick={() =>
              void doMutate(
                "POST /api/calendar/items",
                () =>
                  postCalendarItem(tok, {
                    title: calTitle.trim() || "event",
                    start: calStart.trim() || undefined,
                    end: calEnd.trim() || undefined,
                    allDay: calAllDay,
                    reminder: calReminder.trim() || undefined,
                    recurrence: calRecurrence.trim() || undefined,
                    assignToEveryone: calEveryone,
                    assignedToUserId: calAssigned.trim() || undefined,
                    description: calDesc.trim() || undefined,
                    notes: calNotes.trim() || undefined,
                    link: calLink.trim() || undefined,
                  }),
                { requireActor: false }
              )
            }
          >
            POST /api/calendar/items
          </button>

          <h2>Patch / complete / delete</h2>
          <div className="hb-grid2">
            <label>Patch id</label>
            <input value={calPatchId} onChange={(e) => setCalPatchId(e.target.value)} />
            <label>New title</label>
            <input value={calPatchTitle} onChange={(e) => setCalPatchTitle(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={loading || !canAuth}
            onClick={() => {
              const id = parseInt(calPatchId, 10);
              if (!id) return setOutput("Patch id?");
              void doMutate(
                "PATCH",
                () => patchCalendarItem(tok, id, { title: calPatchTitle.trim() || undefined }),
                { requireActor: false }
              );
            }}
          >
            PATCH /api/calendar/items/{"{id}"}
          </button>
          <div className="hb-grid2">
            <label>Action id</label>
            <input value={calActionId} onChange={(e) => setCalActionId(e.target.value)} />
          </div>
          <div className="hb-btn-row">
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(calActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("POST complete", () => postCalendarItemComplete(tok, actor, id));
              }}
            >
              POST complete
            </button>
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(calActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("DELETE", () => deleteCalendarItem(tok, actor, id));
              }}
            >
              DELETE item
            </button>
          </div>
        </section>
      )}

      {section === "undo" && (
        <section className="hb-section">
          <p>Reverts the last undoable row in <code>ActionLog</code> for <code>actorUserId</code>.</p>
          <button
            type="button"
            className="hb-btn-primary"
            disabled={loading || !canActor}
            onClick={() => void doMutate("POST /api/undo", () => postUndo(tok, actor))}
          >
            POST /api/undo
          </button>
        </section>
      )}

      {requiresToken && !canRead && <p className="hb-warn">Set a bearer token to call the API.</p>}

      <pre className="hb-json">{output}</pre>
    </div>
  );
}
