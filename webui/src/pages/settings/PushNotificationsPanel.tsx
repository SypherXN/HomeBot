import { useCallback, useEffect, useState } from "react";
import { getPushPublicConfig } from "../../api";
import { isPushSubscribed, subscribeToPushNotifications, unsubscribeFromPushNotifications } from "../../lib/pushNotifications";

type Props = { token: string };

export default function PushNotificationsPanel({ token }: Props) {
  const tok = token.trim();
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tok) return;
    try {
      const cfg = await getPushPublicConfig(tok);
      setConfigured(cfg.configured);
      setSubscribed(await isPushSubscribed());
    } catch {
      setConfigured(false);
      setSubscribed(false);
    }
  }, [tok]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!tok) {
    return <p className="text-sm text-slate-500">Sign in to enable push notifications.</p>;
  }

  if (!configured) {
    return (
      <p className="text-sm text-slate-500">
        Server push is not configured. Set <code className="text-slate-300">HOMEBOT_VAPID_*</code> on the API host
        (see <code className="text-slate-300">.env.example</code>).
      </p>
    );
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      await subscribeToPushNotifications(tok);
      setSubscribed(true);
      setMsg("Push enabled. Add the app to your iPhone home screen for best results.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      await unsubscribeFromPushNotifications(tok);
      setSubscribed(false);
      setMsg("Push disabled.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm text-slate-300">
      <p className="text-slate-400">
        Calendar reminders and budget alerts can notify this device (uses the same toggles as Discord in notification
        preferences). Best on an installed PWA — iPhone 16.4+.
      </p>
      <p>
        Status:{" "}
        <span className={subscribed ? "text-emerald-400" : "text-slate-500"}>
          {subscribed ? "Subscribed on this device" : "Not subscribed"}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || subscribed}
          onClick={() => void enable()}
          className="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-sm text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
        >
          Enable push
        </button>
        <button
          type="button"
          disabled={busy || !subscribed}
          onClick={() => void disable()}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Disable
        </button>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
    </div>
  );
}
