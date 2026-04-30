import { useMemo, useState } from "react";
import { getApiBaseUrl, getBuy, getCalendar, getHealth, getMeta, getMoneyTransactions, getWishlist } from "./api";

type TabKey = "health" | "buy" | "wishlist" | "money" | "calendar";

function App() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<TabKey>("health");
  const [output, setOutput] = useState<string>("Click a button to fetch data.");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const requiresToken = tab !== "health";
  const canRun = !requiresToken || token.trim().length > 0;
  const baseUrl = useMemo(() => getApiBaseUrl(), []);

  async function run() {
    if (!canRun) return;
    setLoading(true);
    try {
      let data: unknown;
      if (tab === "health") {
        const [health, meta] = await Promise.all([getHealth(), getMeta()]);
        data = { health, meta };
      } else if (tab === "buy") {
        data = await getBuy(token.trim(), page);
      } else if (tab === "wishlist") {
        data = await getWishlist(token.trim(), page);
      } else if (tab === "money") {
        data = await getMoneyTransactions(token.trim(), page);
      } else {
        data = await getCalendar(token.trim(), page);
      }
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutput(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <h1>HomeBot WebUI (Starter)</h1>
      <p className="sub">API base URL: <code>{baseUrl}</code></p>

      <div className="panel">
        <label htmlFor="token">API Bearer Token</label>
        <input
          id="token"
          type="password"
          placeholder="HOMEBOT_API_TOKEN"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </div>

      <div className="tabs">
        <button className={tab === "health" ? "active" : ""} onClick={() => setTab("health")}>Health+Meta</button>
        <button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}>Buy</button>
        <button className={tab === "wishlist" ? "active" : ""} onClick={() => setTab("wishlist")}>Wishlist</button>
        <button className={tab === "money" ? "active" : ""} onClick={() => setTab("money")}>Money Transactions</button>
        <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>Calendar</button>
      </div>

      <div className="controls">
        <label htmlFor="page">Page</label>
        <input
          id="page"
          type="number"
          min={0}
          value={page}
          onChange={(event) => setPage(Math.max(0, Number(event.target.value) || 0))}
        />
        <button disabled={!canRun || loading} onClick={run}>
          {loading ? "Loading..." : "Fetch"}
        </button>
      </div>

      {!canRun && <p className="warn">This endpoint requires a bearer token.</p>}

      <pre>{output}</pre>
    </main>
  );
}

export default App;
