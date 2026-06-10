import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDiscordOAuthUrl, postAuthLogin } from "../api";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { applyWebLogin, token } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthHint, setOauthHint] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await postAuthLogin(username.trim(), password);
      applyWebLogin(r);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startDiscordOAuth = async () => {
    setError(null);
    setOauthHint(null);
    setOauthBusy(true);
    try {
      const r = await getDiscordOAuthUrl();
      if (!r.configured || !r.authorizeUrl) {
        setOauthHint(
          r.reason ??
            "The API does not have Discord OAuth env vars set. Use username and password, or ask your admin to configure OAuth."
        );
        return;
      }
      window.location.href = r.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOauthBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 pt-4 sm:pt-10">
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 text-white shadow-[0_8px_30px_-8px] shadow-blue-600/50">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9 21v-6h6v6" />
          </svg>
        </span>
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with your household username and password, or with Discord if your admin enabled
          OAuth.
        </p>
      </div>

      <div className="hb-card space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          <button
            type="button"
            disabled={oauthBusy}
            onClick={() => void startDiscordOAuth()}
            className="w-full rounded-xl border border-blue-500/50 bg-blue-950/40 px-4 py-2.5 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-900/40 disabled:opacity-50"
          >
            {oauthBusy ? "Loading…" : "Continue with Discord"}
          </button>
          {oauthHint ? <p className="text-xs text-slate-500">{oauthHint}</p> : null}
          <div className="flex items-center gap-3 py-1 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-700/60" />
            or use password
            <span className="h-px flex-1 bg-slate-700/60" />
          </div>
        </div>

        {token.trim() ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
            You already have a bearer token stored. Signing in will replace it.{" "}
            <Link to="/settings" className="text-blue-400 hover:underline">
              Settings
            </Link>
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-user" className="block text-sm font-medium text-slate-300">
              Username
            </label>
            <input
              id="login-user"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="login-pass" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full hb-input px-3 py-2 text-slate-100"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px] shadow-blue-600/40 transition-all hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-slate-500">
        First time?{" "}
        <Link to="/setup" className="text-blue-400 hover:underline">
          Create a household account
        </Link>
      </p>
    </div>
  );
}
