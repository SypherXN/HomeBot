import { useEffect, useId, useState } from "react";
import { getDiscordGuildMembers, type DiscordGuildMembersResponse } from "../api";
import type { DiscordGuildRosterState } from "../hooks/useDiscordGuildRoster";

type Props = {
  token: string;
  /** Called with the selected Discord user id string, or empty when cleared. */
  onPickUserId: (userId: string) => void;
  /** Shown above the select when there is room. */
  label?: string;
  className?: string;
  disabled?: boolean;
  /**
   * When provided (e.g. from useDiscordGuildRoster in a parent), skips an extra GET — use on pages with many pickers.
   */
  sharedRoster?: DiscordGuildRosterState;
};

/**
 * Loads guild members from GET /api/discord/guild/members and fills a user id field.
 * When the API is unavailable (API-only mode, Discord offline), shows a short notice instead.
 */
export default function DiscordMemberSelect({
  token,
  onPickUserId,
  label = "Pick from server",
  className = "",
  disabled = false,
  sharedRoster,
}: Props) {
  const id = useId();
  const [state, setState] = useState<DiscordGuildMembersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useShared = sharedRoster !== undefined;

  useEffect(() => {
    if (useShared) return;
    if (!token.trim()) {
      setState(null);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    getDiscordGuildMembers(token.trim(), ac.signal)
      .then(setState)
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setState(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [token, useShared]);

  const rosterData = useShared ? sharedRoster!.data : state;
  const rosterLoading = useShared ? sharedRoster!.loading : loading;
  const rosterError = useShared ? sharedRoster!.error : error;

  if (!token.trim()) {
    return null;
  }

  if (rosterLoading && !rosterData) {
    return (
      <p className={`text-xs text-slate-500 ${className}`} id={id}>
        Loading server roster…
      </p>
    );
  }

  if (rosterError) {
    return (
      <p className={`text-xs text-red-300 ${className}`} id={id}>
        {rosterError}
      </p>
    );
  }

  if (!rosterData) {
    return null;
  }

  if (!rosterData.available) {
    return (
      <p className={`text-xs text-amber-200/90 ${className}`} id={id} title={rosterData.reason ?? ""}>
        Server roster unavailable. {rosterData.reason ?? "Connect Discord or check DISCORD_GUILD_ID."}
      </p>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-slate-400">
        {label}
      </label>
      <select
        id={id}
        disabled={disabled}
        defaultValue=""
        className="max-w-md rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        onChange={(e) => onPickUserId(e.target.value)}
      >
        <option value="">— Choose a person —</option>
        {rosterData.members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.displayName} (@{m.username}) — {m.userId}
          </option>
        ))}
      </select>
      {rosterData.guildId && !useShared && (
        <p className="text-xs text-slate-500">Guild {rosterData.guildId}</p>
      )}
    </div>
  );
}
