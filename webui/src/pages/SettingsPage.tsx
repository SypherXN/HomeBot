import { useAuth } from "../auth/AuthContext";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import TimeZoneSelect from "../components/TimeZoneSelect";
import { useCalendarZone } from "../calendar/CalendarZoneContext";

export default function SettingsPage() {
  const { token, setToken, actorUserId, setActorUserId } = useAuth();
  const { viewerTimeZone, setViewerTimeZone } = useCalendarZone();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-slate-400">
          Stored only in this browser (localStorage). Never commit tokens to source control.
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="settings-token" className="block text-sm font-medium text-slate-300">
          Bearer token
        </label>
        <input
          id="settings-token"
          type="password"
          autoComplete="off"
          placeholder="HOMEBOT_API_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full max-w-xl rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
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
