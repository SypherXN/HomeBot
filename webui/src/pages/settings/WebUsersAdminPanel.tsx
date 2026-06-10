import { useCallback, useEffect, useState } from "react";
import {
  getAdminInviteStatus,
  getAdminUsers,
  patchAdminResetPassword,
  postAdminDeactivateUser,
  postAdminInviteRotate,
  type WebInviteStatus,
  type WebUserAdminRow,
} from "../../api";

type Props = {
  token: string;
};

export default function WebUsersAdminPanel({ token }: Props) {
  const tok = token.trim();
  const [users, setUsers] = useState<WebUserAdminRow[]>([]);
  const [invite, setInvite] = useState<WebInviteStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState("");
  const [resetPass, setResetPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tok) return;
    setErr(null);
    try {
      const [u, inv] = await Promise.all([getAdminUsers(tok), getAdminInviteStatus(tok)]);
      setUsers(u.users);
      setInvite(inv);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [tok]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tok) {
    return <p className="text-sm text-slate-500">Sign in with an admin web account to manage users.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      {err ? <p className="text-red-300">{err}</p> : null}
      {msg ? <p className="text-emerald-300">{msg}</p> : null}

      <div>
        <h3 className="font-medium text-slate-200">Web users</h3>
        <ul className="mt-2 space-y-1 text-slate-400">
          {users.map((u) => (
            <li key={u.username} className="flex flex-wrap items-center gap-2">
              <span className="text-slate-200">{u.username}</span>
              {!u.isActive ? <span className="text-amber-400">inactive</span> : null}
              {u.isAdmin ? <span className="text-sky-400">admin</span> : null}
              {u.isActive && !u.isAdmin ? (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:underline"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await postAdminDeactivateUser(tok, u.username);
                        setMsg(`Deactivated ${u.username}.`);
                        await load();
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Deactivate
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="font-medium text-slate-200">Invite token</h3>
        <p className="text-xs text-slate-500">
          Env token: {invite?.envTokenConfigured ? "yes" : "no"} · DB token:{" "}
          {invite?.dbTokenActive ? "active" : "none"}
        </p>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg hb-btn-soft px-3 py-2 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setNewToken(null);
              try {
                const r = await postAdminInviteRotate(tok);
                setNewToken(r.inviteToken);
                setMsg(r.message);
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Rotate invite token
        </button>
        {newToken ? (
          <p className="rounded border border-amber-800/50 bg-amber-950/40 px-3 py-2 font-mono text-xs text-amber-100">
            {newToken}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="font-medium text-slate-200">Reset password</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={resetUser}
            onChange={(e) => setResetUser(e.target.value)}
            placeholder="username"
            className="hb-input px-2 py-1.5 text-slate-100"
          />
          <input
            type="password"
            value={resetPass}
            onChange={(e) => setResetPass(e.target.value)}
            placeholder="new password"
            className="hb-input px-2 py-1.5 text-slate-100"
          />
          <button
            type="button"
            disabled={busy || !resetUser.trim() || resetPass.length < 8}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await patchAdminResetPassword(tok, resetUser.trim(), resetPass);
                  setMsg(`Password updated for ${resetUser.trim()}.`);
                  setResetPass("");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
