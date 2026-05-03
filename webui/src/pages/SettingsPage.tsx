import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import TimeZoneSelect from "../components/TimeZoneSelect";
import { useCalendarZone } from "../calendar/CalendarZoneContext";
import {
  getApiBaseUrl,
  isApiBaseInferred,
  resetApiBaseUrlToDefault,
  setApiBaseUrl,
  subscribeApiBaseUrl,
} from "../api";

export default function SettingsPage() {
  const { token, setToken, actorUserId, setActorUserId, webUsername, clearSession } = useAuth();
  const { viewerTimeZone, setViewerTimeZone } = useCalendarZone();
  const [apiDraft, setApiDraft] = useState(() => getApiBaseUrl());

  useEffect(() => subscribeApiBaseUrl(() => setApiDraft(getApiBaseUrl())), []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-slate-400">
          Stored only in this browser (localStorage). Never commit tokens to source control.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
        <h2 className="text-sm font-semibold text-white">API server</h2>
        <p className="max-w-2xl text-sm text-slate-400">
          Base URL for <code className="text-slate-300">/api/…</code> requests. With Vite on port{" "}
          <strong className="text-slate-300">5173</strong> (dev) or <strong className="text-slate-300">4173</strong>{" "}
          (preview), the UI assumes the API is on the <strong className="text-slate-300">same hostname</strong> with
          port <strong className="text-slate-300">5050</strong> — so opening{" "}
          <code className="text-slate-300">http://192.168.1.5:5173</code> on your phone talks to{" "}
          <code className="text-slate-300">http://192.168.1.5:5050</code> automatically.{" "}
          {isApiBaseInferred() ? (
            <span className="text-emerald-400/90">Using that auto-detection right now.</span>
          ) : (
            <span>
              Override below if your API uses a different host or port, then <strong className="text-slate-300">Save</strong>.
            </span>
          )}
        </p>
        <label htmlFor="settings-api-base" className="block text-sm font-medium text-slate-300">
          API base URL
        </label>
        <input
          id="settings-api-base"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="http://192.168.1.5:5050"
          value={apiDraft}
          onChange={(e) => setApiDraft(e.target.value)}
          className="w-full max-w-xl rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setApiBaseUrl(apiDraft)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => resetApiBaseUrlToDefault()}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Reset to build default
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
        <h2 className="text-sm font-semibold text-white">Web sign-in</h2>
        <p className="max-w-2xl text-sm text-slate-400">
          Prefer signing in with a household username and password (see <span className="text-slate-300">Sign in</span>{" "}
          in the sidebar). That stores a short-lived JWT and sets <code className="text-slate-300">actorUserId</code>{" "}
          from your profile.
        </p>
        {webUsername ? (
          <p className="text-sm text-slate-300">
            Web session: <strong className="text-white">{webUsername}</strong>
          </p>
        ) : (
          <p className="text-sm text-slate-500">No web username on this browser (legacy API token or not signed in).</p>
        )}
        <button
          type="button"
          onClick={() => clearSession()}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          Sign out &amp; clear token
        </button>
      </div>

      <div className="space-y-3">
        <label htmlFor="settings-token" className="block text-sm font-medium text-slate-300">
          Bearer token (optional)
        </label>
        <input
          id="settings-token"
          type="password"
          autoComplete="off"
          placeholder="HOMEBOT_API_TOKEN or paste JWT"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full max-w-xl rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="max-w-2xl text-xs text-slate-500">
          Advanced: shared <code className="text-slate-400">HOMEBOT_API_TOKEN</code> still works when the server has
          one. Web login issues a JWT that is also sent as the bearer.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
        <h2 className="text-sm font-semibold text-white">Calendar display</h2>
        <p className="max-w-2xl text-sm text-slate-400">
          Choose which time zone the calendar grid and range query use when you are away from home. This does not change
          how events are stored on the server; each event can still have its own event time zone when you create it.
        </p>
        <label htmlFor="settings-viewer-tz" className="block text-sm font-medium text-slate-300">
          Viewer time zone
        </label>
        <TimeZoneSelect id="settings-viewer-tz" value={viewerTimeZone} onChange={setViewerTimeZone} />
      </div>

      <div className="space-y-3">
        <label htmlFor="settings-actor" className="block text-sm font-medium text-slate-300">
          actorUserId
        </label>
        <DiscordMemberSelect
          token={token}
          label="Choose your Discord account (fills the field below)"
          onPickUserId={setActorUserId}
        />
        <input
          id="settings-actor"
          type="text"
          inputMode="numeric"
          placeholder="Discord user id for mutations that require it"
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value)}
          className="w-full max-w-xl rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-300">When required:</strong> buy &amp; wishlist add, item complete/delete, money
          &amp; calendar delete, undo — the API sends <code className="text-slate-300">actorUserId</code> (non-zero
          digits). <strong className="text-slate-300">Not required</strong> for money or calendar creates, money/calendar
          PATCH, buy PUT, or clearing completed lists. Use digits only (snowflakes within JavaScript safe integer range in
          this UI).
        </p>
        <p className="max-w-2xl text-xs text-slate-500">
          The server roster requires the bot process to have Discord enabled, a valid{" "}
          <code className="text-slate-400">DISCORD_GUILD_ID</code>, and the gateway connected. API-only mode cannot load
          members.
        </p>
      </div>
    </div>
  );
}
