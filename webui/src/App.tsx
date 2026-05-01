import { useMemo, useState } from "react";
import {
  deleteBuyCompleted,
  deleteBuyItem,
  deleteCalendarItem,
  deleteMoneyTransaction,
  deleteWishlistCompleted,
  deleteWishlistItem,
  getApiBaseUrl,
  getBuyItems,
  getCalendarItems,
  getCalendarToday,
  getCalendarUpcoming,
  getHealth,
  getMeta,
  getMoneySummary,
  getMoneyTransactions,
  getWishlistItems,
  patchCalendarItem,
  patchMoneyTransaction,
  postBuyItem,
  postBuyItemComplete,
  postCalendarItem,
  postCalendarItemComplete,
  postMoneyExpense,
  postMoneyExpenseSplit,
  postMoneyPayment,
  postUndo,
  postWishlistItem,
  postWishlistItemComplete,
  putBuyItem,
} from "./api";

type TabKey = "health" | "buy" | "wishlist" | "money" | "calendar" | "undo";

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function validActorId(raw: string): boolean {
  const t = raw.trim();
  return /^\d+$/.test(t) && t !== "0";
}

export default function App() {
  const [token, setToken] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [tab, setTab] = useState<TabKey>("health");
  const [output, setOutput] = useState<string>("Use Health to verify the API, then pick a tab.");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [buyName, setBuyName] = useState("");
  const [buyQty, setBuyQty] = useState("1");
  const [buyStore, setBuyStore] = useState("");
  const [buyTags, setBuyTags] = useState("");
  const [buyNotes, setBuyNotes] = useState("");
  const [buyAssigned, setBuyAssigned] = useState("");
  const [buyEditId, setBuyEditId] = useState("");
  const [buyEditName, setBuyEditName] = useState("");
  const [buyActionId, setBuyActionId] = useState("");

  const [wlName, setWlName] = useState("");
  const [wlOwner, setWlOwner] = useState("");
  const [wlPrice, setWlPrice] = useState("");
  const [wlLink, setWlLink] = useState("");
  const [wlDesc, setWlDesc] = useState("");
  const [wlNotes, setWlNotes] = useState("");
  const [wlPriority, setWlPriority] = useState("");
  const [wlTags, setWlTags] = useState("");
  const [wlActionId, setWlActionId] = useState("");

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
  const actor = actorUserId.trim();
  const requiresToken = tab !== "health";
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
      if (tab === "health") {
        data = { health: await getHealth(), meta: await getMeta() };
      } else if (tab === "buy") {
        data = await getBuyItems(tok, page);
      } else if (tab === "wishlist") {
        data = await getWishlistItems(tok, page);
      } else if (tab === "money") {
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
    <main className="app">
      <h1>HomeBot WebUI</h1>
      <p className="sub">
        API: <code>{baseUrl}</code> — reads use REST <code>/api/…/items</code> paths; writes match Phase 2 routes.
      </p>

      <div className="panel stack">
        <label htmlFor="token">Bearer token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          placeholder="HOMEBOT_API_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>

      <div className="panel stack">
        <label htmlFor="actor">actorUserId</label>
        <input
          id="actor"
          type="text"
          inputMode="numeric"
          placeholder="Discord user id for mutations"
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value)}
        />
        <p className="hint">
          <strong>When required:</strong> buy &amp; wishlist <em>add</em>, item complete/delete, money &amp; calendar
          <em> delete</em>, undo — API sends <code>actorUserId</code> (your Discord user id, non-zero digits).{" "}
          <strong>Not required</strong> for money or calendar <em>creates</em>, money/calendar PATCH, buy PUT, or clearing
          completed lists. Use digits only (snowflakes within JavaScript safe integer range in this UI).
        </p>
      </div>

      <div className="tabs">
        <button type="button" className={tab === "health" ? "active" : ""} onClick={() => setTab("health")}>
          Health
        </button>
        <button type="button" className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}>
          Buy
        </button>
        <button type="button" className={tab === "wishlist" ? "active" : ""} onClick={() => setTab("wishlist")}>
          Wishlist
        </button>
        <button type="button" className={tab === "money" ? "active" : ""} onClick={() => setTab("money")}>
          Money
        </button>
        <button type="button" className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>
          Calendar
        </button>
        <button type="button" className={tab === "undo" ? "active" : ""} onClick={() => setTab("undo")}>
          Undo
        </button>
      </div>

      {tab === "health" && (
        <section className="section">
          <button type="button" disabled={!canRead || loading} onClick={runRead}>
            {loading ? "…" : "GET /api/health + /api/meta"}
          </button>
        </section>
      )}

      {tab === "buy" && (
        <section className="section">
          <h2>Buy list</h2>
          <div className="row">
            <label htmlFor="page">Page</label>
            <input
              id="page"
              type="number"
              min={0}
              value={page}
              onChange={(e) => setPage(Math.max(0, Number(e.target.value) || 0))}
            />
            <button type="button" disabled={!canRead || loading} onClick={runRead}>
              GET /api/buy/items
            </button>
          </div>

          <h2>Add item</h2>
          <p className="hint">
            <strong>Required:</strong> name. <strong>Optional:</strong> quantity, store, tags, notes, assignedTo (Discord
            id of assignee).
          </p>
          <div className="grid2">
            <label>Name *</label>
            <input value={buyName} onChange={(e) => setBuyName(e.target.value)} placeholder="Milk" />
            <label>Qty (opt.)</label>
            <input value={buyQty} onChange={(e) => setBuyQty(e.target.value)} placeholder="1" />
            <label>Store (opt.)</label>
            <input value={buyStore} onChange={(e) => setBuyStore(e.target.value)} />
            <label>Tags (opt.)</label>
            <input value={buyTags} onChange={(e) => setBuyTags(e.target.value)} placeholder="a, b" />
            <label>Notes (opt.)</label>
            <input value={buyNotes} onChange={(e) => setBuyNotes(e.target.value)} />
            <label>AssignedTo (opt.)</label>
            <input value={buyAssigned} onChange={(e) => setBuyAssigned(e.target.value)} placeholder="Discord user id" />
          </div>
          <button
            type="button"
            className="primary"
            disabled={loading || !canActor}
            onClick={() =>
              void doMutate(
                "POST /api/buy/items",
                () =>
                  postBuyItem(tok, actor, {
                    name: buyName.trim() || "item",
                    quantity: buyQty || undefined,
                    store: buyStore || undefined,
                    tags: buyTags || undefined,
                    notes: buyNotes || undefined,
                    assignedTo: buyAssigned.trim() || undefined,
                  })
              )
            }
          >
            POST /api/buy/items
          </button>

          <h2>Update item</h2>
          <p className="hint">Needs token only. Send at least one field to change (name, qty, store, tags, notes, assignedTo).</p>
          <div className="grid2">
            <label>Id</label>
            <input value={buyEditId} onChange={(e) => setBuyEditId(e.target.value)} placeholder="1" />
            <label>New name (opt.)</label>
            <input value={buyEditName} onChange={(e) => setBuyEditName(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={loading || !canAuth}
            onClick={() => {
              const id = parseInt(buyEditId, 10);
              if (!id) {
                setOutput("Enter numeric id.");
                return;
              }
              void doMutate(
                "PUT /api/buy/items/{id}",
                () => putBuyItem(tok, id, { name: buyEditName.trim() || undefined }),
                { requireActor: false }
              );
            }}
          >
            PUT /api/buy/items/{"{id}"}
          </button>

          <h2>Complete / delete / clear completed</h2>
          <div className="grid2">
            <label>Item id</label>
            <input value={buyActionId} onChange={(e) => setBuyActionId(e.target.value)} />
          </div>
          <div className="btnRow">
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(buyActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("POST …/complete", () => postBuyItemComplete(tok, actor, id));
              }}
            >
              POST complete
            </button>
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(buyActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("DELETE item", () => deleteBuyItem(tok, actor, id));
              }}
            >
              DELETE item
            </button>
            <button
              type="button"
              disabled={loading || !canAuth}
              onClick={() =>
                void doMutate("DELETE completed", () => deleteBuyCompleted(tok), { requireActor: false })
              }
            >
              DELETE completed
            </button>
          </div>
        </section>
      )}

      {tab === "wishlist" && (
        <section className="section">
          <h2>List</h2>
          <div className="row">
            <label htmlFor="page2">Page</label>
            <input
              id="page2"
              type="number"
              min={0}
              value={page}
              onChange={(e) => setPage(Math.max(0, Number(e.target.value) || 0))}
            />
            <button type="button" disabled={!canRead || loading} onClick={runRead}>
              GET /api/wishlist/items
            </button>
          </div>

          <h2>Add</h2>
          <p className="hint">
            <strong>Required:</strong> name. <strong>Optional:</strong> owner (defaults to actor), price, link, description,
            notes, priority (1–3), tags (comma-separated).
          </p>
          <div className="grid2">
            <label>Name *</label>
            <input value={wlName} onChange={(e) => setWlName(e.target.value)} />
            <label>Owner user id (opt.)</label>
            <input value={wlOwner} onChange={(e) => setWlOwner(e.target.value)} placeholder="defaults to actor" />
            <label>Price (opt.)</label>
            <input value={wlPrice} onChange={(e) => setWlPrice(e.target.value)} placeholder="$10" />
            <label>Link (opt.)</label>
            <input value={wlLink} onChange={(e) => setWlLink(e.target.value)} />
            <label>Description (opt.)</label>
            <input value={wlDesc} onChange={(e) => setWlDesc(e.target.value)} />
            <label>Notes (opt.)</label>
            <input value={wlNotes} onChange={(e) => setWlNotes(e.target.value)} />
            <label>Priority (opt.)</label>
            <input value={wlPriority} onChange={(e) => setWlPriority(e.target.value)} placeholder="1, 2, or 3" />
            <label>Tags (opt.)</label>
            <input value={wlTags} onChange={(e) => setWlTags(e.target.value)} />
          </div>
          <button
            type="button"
            className="primary"
            disabled={loading || !canActor}
            onClick={() =>
              void doMutate(
                "POST /api/wishlist/items",
                () =>
                  postWishlistItem(tok, actor, {
                    name: wlName.trim() || "wish",
                    ownerUserId: wlOwner.trim() || undefined,
                    price: wlPrice || undefined,
                    link: wlLink || undefined,
                    description: wlDesc || undefined,
                    notes: wlNotes || undefined,
                    priority: wlPriority.trim() || undefined,
                    tags: wlTags || undefined,
                  })
              )
            }
          >
            POST /api/wishlist/items
          </button>

          <h2>Complete / delete / clear completed</h2>
          <div className="grid2">
            <label>Item id</label>
            <input value={wlActionId} onChange={(e) => setWlActionId(e.target.value)} />
          </div>
          <div className="btnRow">
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(wlActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("POST complete", () => postWishlistItemComplete(tok, actor, id));
              }}
            >
              POST complete
            </button>
            <button
              type="button"
              disabled={loading || !canActor}
              onClick={() => {
                const id = parseInt(wlActionId, 10);
                if (!id) return setOutput("Enter id.");
                void doMutate("DELETE item", () => deleteWishlistItem(tok, actor, id));
              }}
            >
              DELETE item
            </button>
            <button
              type="button"
              disabled={loading || !canAuth}
              onClick={() =>
                void doMutate("DELETE completed", () => deleteWishlistCompleted(tok), { requireActor: false })
              }
            >
              DELETE completed
            </button>
          </div>
        </section>
      )}

      {tab === "money" && (
        <section className="section">
          <h2>Transactions</h2>
          <div className="row">
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
          <div className="grid2">
            <label>user1</label>
            <input value={sum1} onChange={(e) => setSum1(e.target.value)} />
            <label>user2</label>
            <input value={sum2} onChange={(e) => setSum2(e.target.value)} />
          </div>
          <button type="button" disabled={!canRead || loading} onClick={() => void runMoneySummary()}>
            GET /api/money/summary
          </button>

          <h2>Add expense</h2>
          <p className="hint">
            <strong>Required:</strong> name, amount, paidBy, owedBy (each a non-zero Discord user id).{" "}
            <strong>No actorUserId</strong> query on this route.
          </p>
          <div className="grid2">
            <label>Name *</label>
            <input value={expName} onChange={(e) => setExpName(e.target.value)} />
            <label>amountInput *</label>
            <input value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="12.50" />
            <label>paidBy *</label>
            <input value={expPaidBy} onChange={(e) => setExpPaidBy(e.target.value)} placeholder="Discord user id" />
            <label>owedBy *</label>
            <input value={expOwedBy} onChange={(e) => setExpOwedBy(e.target.value)} placeholder="Discord user id" />
          </div>
          {canActor && (
            <div className="btnRow">
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
            className="primary"
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
          <p className="hint">
            Same as expense plus <strong>percent</strong> (1–100). Optional description/notes.
          </p>
          <div className="grid2">
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
          {canActor && (
            <div className="btnRow">
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
          <p className="hint">
            <strong>Required:</strong> amount, paidBy, receivedBy. <strong>No actorUserId</strong> on this route.
          </p>
          <div className="grid2">
            <label>amountInput *</label>
            <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <label>paidBy *</label>
            <input value={payFrom} onChange={(e) => setPayFrom(e.target.value)} />
            <label>receivedBy *</label>
            <input value={payTo} onChange={(e) => setPayTo(e.target.value)} />
          </div>
          {canActor && (
            <div className="btnRow">
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
          <p className="hint">PATCH needs token only. DELETE needs <code>actorUserId</code> (same as other deletes).</p>
          <div className="grid2">
            <label>Tx id</label>
            <input value={moneyEditId} onChange={(e) => setMoneyEditId(e.target.value)} />
            <label>Name</label>
            <input value={moneyEditName} onChange={(e) => setMoneyEditName(e.target.value)} />
            <label>amountInput</label>
            <input value={moneyEditAmount} onChange={(e) => setMoneyEditAmount(e.target.value)} />
          </div>
          <div className="btnRow">
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
          <div className="grid2">
            <label>Delete id</label>
            <input value={moneyDelId} onChange={(e) => setMoneyDelId(e.target.value)} />
          </div>
        </section>
      )}

      {tab === "calendar" && (
        <section className="section">
          <h2>List / today / upcoming</h2>
          <div className="row">
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
          <div className="grid2">
            <label>userFilter (opt.)</label>
            <input value={calFilterUser} onChange={(e) => setCalFilterUser(e.target.value)} />
          </div>
          <div className="btnRow">
            <button type="button" disabled={!canRead || loading} onClick={() => void runCalendarToday()}>
              GET /api/calendar/today
            </button>
            <button type="button" disabled={!canRead || loading} onClick={() => void runCalendarUpcoming()}>
              GET /api/calendar/upcoming
            </button>
          </div>

          <h2>Create item</h2>
          <p className="hint">
            <strong>Required:</strong> title. <strong>Optional:</strong> start (natural language; empty = task), end,
            allDay, reminder (e.g. 10m, 2h), recurrence (<code>daily</code> or <code>weekly</code>), assignToEveryone,
            assignedToUserId, description, notes, link. <strong>No actorUserId</strong> on create.
          </p>
          <div className="grid2">
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
          <button
            type="button"
            className="primary"
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
          <div className="grid2">
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
          <div className="grid2">
            <label>Action id</label>
            <input value={calActionId} onChange={(e) => setCalActionId(e.target.value)} />
          </div>
          <div className="btnRow">
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

      {tab === "undo" && (
        <section className="section">
          <p>Reverts the last undoable row in <code>ActionLog</code> for <code>actorUserId</code>.</p>
          <button
            type="button"
            className="primary"
            disabled={loading || !canActor}
            onClick={() => void doMutate("POST /api/undo", () => postUndo(tok, actor))}
          >
            POST /api/undo
          </button>
        </section>
      )}

      {requiresToken && !canRead && <p className="warn">Set a bearer token to call the API.</p>}

      <pre>{output}</pre>
    </main>
  );
}
