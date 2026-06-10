import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthDiscordStatus,
  postAuthBootstrap,
  postAuthDiscordCompleteBootstrap,
  postAuthDiscordCompleteRegister,
  postAuthDiscordStart,
  postAuthRegister,
  type AuthDiscordStatus,
} from "../api";

type Tab = "discord" | "manualBoot" | "manualInvite";

export default function SetupPage() {
  const [tab, setTab] = useState<Tab>("discord");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [discIntent, setDiscIntent] = useState<"bootstrap" | "register">("bootstrap");
  const [sessionId, setSessionId] = useState("");
  const [discCode, setDiscCode] = useState("");
  const [discMsg, setDiscMsg] = useState<string | null>(null);
  const [discStatus, setDiscStatus] = useState<AuthDiscordStatus | null>(null);

  useEffect(() => {
    if (!sessionId.trim()) {
      setDiscStatus(null);
      return;
    }

    const poll = () => {
      void getAuthDiscordStatus(sessionId)
        .then(setDiscStatus)
        .catch(() => setDiscStatus(null));
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [sessionId]);

  const resetDiscord = () => {
    setSessionId("");
    setDiscCode("");
    setDiscMsg(null);
    setDiscStatus(null);
    setUsername("");
    setPassword("");
  };

  const startDiscord = async () => {
    setError(null);
    setMessage(null);
    setDiscMsg(null);
    setBusy(true);
    try {
      const r = await postAuthDiscordStart({ intent: discIntent });
      setSessionId(r.sessionId);
      setDiscCode(r.code);
      setDiscMsg(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitDiscordFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (discIntent === "bootstrap") {
        const r = await postAuthDiscordCompleteBootstrap({
          sessionId,
          username: username.trim(),
          password,
        });
        setMessage(r.message);
        resetDiscord();
      } else {
        const r = await postAuthDiscordCompleteRegister({
          sessionId,
          username: username.trim(),
          password,
        });
        setMessage(r.message);
        resetDiscord();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const body: {
        username: string;
        password: string;
        discordUserId: string;
        setupToken?: string;
      } = {
        username: username.trim(),
        password,
        discordUserId: discordUserId.trim(),
      };
      if (setupToken.trim()) body.setupToken = setupToken.trim();
      const r = await postAuthBootstrap(body);
      setMessage(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const r = await postAuthRegister({
        inviteToken: inviteToken.trim(),
        username: username.trim(),
        password,
        discordUserId: discordUserId.trim(),
      });
      setMessage(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const canFinishDiscord =
    sessionId &&
    discStatus?.exists &&
    discStatus.discordVerified &&
    !discStatus.consumed &&
    username.trim().length >= 3 &&
    password.length >= 8;

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-4 sm:pt-8">
      <div>
        <h1 className="text-3xl font-semibold text-white">Household accounts</h1>
        <p className="mt-1 text-sm text-slate-400">
          The server still needs <code className="rounded bg-slate-900 px-1">HOMEBOT_WEB_JWT_SECRET</code> (32+ bytes)
          to sign sessions — that value never goes on your phone; only the signed token is stored in the browser (same
          on desktop and mobile). Prefer verifying in Discord so you do not paste user ids into the web app.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(
          [
            ["discord", "Discord verify"],
            ["manualBoot", "Manual · first user"],
            ["manualInvite", "Manual · invite"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setError(null);
              setMessage(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "discord" ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Start here, then in your <strong className="text-slate-200">HomeBot Discord server</strong> run{" "}
            <code className="text-slate-300">/webui-verify</code> and enter the code. The command must be run by the
            same Discord account you want tied to this login.
          </p>
          <div className="flex gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-slate-300">
              <input
                type="radio"
                name="disc-intent"
                checked={discIntent === "bootstrap"}
                onChange={() => setDiscIntent("bootstrap")}
              />
              First household user
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-slate-300">
              <input
                type="radio"
                name="disc-intent"
                checked={discIntent === "register"}
                onChange={() => setDiscIntent("register")}
              />
              Additional member
            </label>
          </div>
          {!sessionId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startDiscord()}
              className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              {busy ? "…" : "Get verification code"}
            </button>
          ) : null}

          {discMsg ? <p className="text-sm text-slate-300">{discMsg}</p> : null}

          {discCode ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your code</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-white">{discCode}</p>
              <p className="mt-2 text-xs text-slate-500">
                Expires {discStatus?.expiresAt ? new Date(discStatus.expiresAt).toLocaleString() : "soon"} · polling
                Discord…
              </p>
            </div>
          ) : null}

          {sessionId && discStatus ? (
            <p className="text-sm text-slate-400">
              {discStatus.consumed
                ? "This session was already used. Start a new code if you still need an account."
                : discStatus.expired
                  ? "This code expired. Click below to start over."
                  : discStatus.discordVerified
                    ? "Discord verified. Choose username and password for the web app."
                    : "Waiting for /webui-verify in Discord…"}
            </p>
          ) : null}

          {sessionId && (discStatus?.expired || discStatus?.consumed) ? (
            <button
              type="button"
              className="text-sm text-blue-400 hover:underline"
              onClick={() => {
                resetDiscord();
                setError(null);
              }}
            >
              Start over
            </button>
          ) : null}

          {discStatus?.discordVerified && !discStatus.consumed ? (
            <form onSubmit={submitDiscordFinish} className="space-y-3 border-t border-slate-800 pt-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Web username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Password (8+ characters)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !canFinishDiscord}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Creating…" : discIntent === "bootstrap" ? "Create first user" : "Create account"}
              </button>
            </form>
          ) : null}
        </div>
      ) : tab === "manualBoot" ? (
        <form onSubmit={submitBootstrap} className="space-y-4">
          <p className="text-sm text-slate-400">
            For API-only or automation. Requires Discord user id on the form. If{" "}
            <code className="text-slate-300">HOMEBOT_WEB_SETUP_TOKEN</code> is set on the server, paste it below.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Password (8+ characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Discord user id</label>
            <input
              value={discordUserId}
              onChange={(e) => setDiscordUserId(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. from Discord developer mode"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Setup token (optional)</label>
            <input
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              type="password"
              autoComplete="off"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create first user"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitInvite} className="space-y-4">
          <p className="text-sm text-slate-400">
            Requires <code className="text-slate-300">HOMEBOT_WEB_INVITE_TOKEN</code> on the server.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300">Invite token</label>
            <input
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              type="password"
              autoComplete="off"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Password (8+ characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Discord user id</label>
            <input
              value={discordUserId}
              onChange={(e) => setDiscordUserId(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Register"}
          </button>
        </form>
      )}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-400" role="status">
          {message}{" "}
          <Link to="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      ) : null}

      <p className="text-center text-sm text-slate-500">
        <Link to="/login" className="text-blue-400 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
