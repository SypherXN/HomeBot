import { useCallback, useEffect, useState } from "react";
import {
  getNotificationPreferences,
  putNotificationPreferences,
  type NotificationPreferences,
} from "../../api";

type Props = { token: string; discordUserId: string };

export default function NotificationPreferencesPanel({ token, discordUserId }: Props) {
  const tok = token.trim();
  const did = discordUserId.trim();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tok || !did) return;
    try {
      setPrefs(await getNotificationPreferences(tok));
    } catch {
      setPrefs({
        discordUserId: did,
        budgetAlerts: true,
        calendarDm: true,
        weeklyDigest: true,
      });
    }
  }, [tok, did]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tok || !did) {
    return (
      <p className="text-sm text-slate-500">
        Web session with linked Discord id required (sign in, set actorUserId to your Discord id).
      </p>
    );
  }

  if (!prefs) return <p className="text-sm text-slate-500">Loading…</p>;

  async function save(next: NotificationPreferences) {
    setPrefs(next);
    await putNotificationPreferences(tok, next);
    setMsg("Saved.");
  }

  return (
    <div className="space-y-2 text-sm text-slate-300">
      {msg ? <p className="text-emerald-300">{msg}</p> : null}
      {(
        [
          ["budgetAlerts", "Budget alerts"],
          ["calendarDm", "Calendar DM reminders"],
          ["weeklyDigest", "Weekly digest (Discord)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs[key]}
            onChange={(e) => void save({ ...prefs, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
