import { useCallback, useEffect, useState } from "react";
import TimeZoneSelect from "../../components/TimeZoneSelect";
import {
  getHouseholdChannelBindings,
  getHouseholdSettings,
  putHouseholdChannelBinding,
  putHouseholdSetting,
} from "../../api";
import { titleCase } from "../../lib/titleCase";

const FEATURES = ["buy", "wishlist", "money", "budget", "calendar", "audit"] as const;

type Props = {
  token: string;
};

export default function HouseholdSettingsPanel({ token }: Props) {
  const tok = token.trim();
  const [pageSize, setPageSize] = useState("");
  const [timezone, setTimezone] = useState("");
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tok) return;
    setErr(null);
    try {
      const [settings, ch] = await Promise.all([getHouseholdSettings(tok), getHouseholdChannelBindings(tok)]);
      setPageSize(settings.settings.page_size ?? "");
      setTimezone(settings.settings.timezone ?? "");
      setBindings(ch.bindings ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [tok]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSetting(key: "page_size" | "timezone", value: string) {
    if (!tok) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await putHouseholdSetting(tok, { key, value });
      setMsg(`Saved ${key}.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBinding(feature: string, channelId: string) {
    if (!tok || !channelId.trim()) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await putHouseholdChannelBinding(tok, { feature, channelId: channelId.trim() });
      setMsg(`Saved ${feature} channel binding.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!tok) {
    return (
      <p className="text-sm text-slate-500">Sign in or set a bearer token to edit household settings on the server.</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-slate-400">
        Same values as Discord <code className="text-slate-300">/config-set</code> and{" "}
        <code className="text-slate-300">/setup-set</code>. Channel ids are Discord snowflakes (enable Developer Mode →
        right-click channel → Copy Channel ID).
      </p>

      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      {err && <p className="text-sm text-red-300">{err}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="hh-page-size" className="mb-1 block text-sm font-medium text-slate-300">
            page_size
          </label>
          <div className="flex gap-2">
            <input
              id="hh-page-size"
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 10"
              className="w-full hb-input px-3 py-2 text-sm text-slate-100"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSetting("page_size", pageSize)}
              className="shrink-0 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="hh-timezone" className="mb-1 block text-sm font-medium text-slate-300">
            timezone (household calendar default)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <TimeZoneSelect id="hh-timezone" value={timezone || "UTC"} onChange={setTimezone} />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSetting("timezone", timezone || "UTC")}
              className="shrink-0 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-white">Channel bindings</h3>
        <ul className="space-y-3">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-24 shrink-0 text-sm text-slate-400">{titleCase(feature)}</span>
              <input
                value={bindings[feature] ?? ""}
                onChange={(e) => setBindings((b) => ({ ...b, [feature]: e.target.value }))}
                inputMode="numeric"
                placeholder="Channel id"
                className="min-w-0 flex-1 hb-input px-3 py-2 font-mono text-sm text-slate-100"
              />
              <button
                type="button"
                disabled={busy || !(bindings[feature] ?? "").trim()}
                onClick={() => void saveBinding(feature, bindings[feature] ?? "")}
                className="shrink-0 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Save
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
