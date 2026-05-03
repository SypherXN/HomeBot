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
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">
          Sign in with your household username and password, or with Discord if your admin enabled OAuth. You must
          already have a web account linked to the same Discord user id (same as password login).
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          disabled={oauthBusy}
          onClick={() => void startDiscordOAuth()}
          className="w-full rounded-md border border-indigo-500/60 bg-indigo-950/40 px-4 py-2.5 text-sm font-medium text-indigo-100 hover:bg-indigo-900/50 disabled:opacity-50"
        >
          {oauthBusy ? "Loading…" : "Continue with Discord"}
        </button>
        {oauthHint ? <p className="text-xs text-slate-500">{oauthHint}</p> : null}
        <p className="text-center text-xs text-slate-500">or use password below</p>
      </div>

      {token.trim() ? (
        <p className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
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
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        First time?{" "}
        <Link to="/setup" className="text-blue-400 hover:underline">
          Create a household account
        </Link>
      </p>
    </div>
  );
}
