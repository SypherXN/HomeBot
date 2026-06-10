import DiscordMemberSelect from "./DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../hooks/useDiscordGuildRoster";

type Props = {
  id?: string;
  token: string;
  value: string;
  onChange: (userId: string) => void;
  label: string;
  sharedRoster?: DiscordGuildRosterState;
  disabled?: boolean;
  /** Show "Use me" when actor id is valid. */
  actorId?: string;
};

/** Discord roster picker with numeric-id fallback when the guild list is unavailable. */
export default function MemberIdField({
  id,
  token,
  value,
  onChange,
  label,
  sharedRoster,
  disabled = false,
  actorId = "",
}: Props) {
  const roster = sharedRoster?.data;
  const rosterReady = roster?.available === true && roster.members.length > 0;
  const canUseActor = /^\d+$/.test(actorId.trim()) && actorId.trim() !== "0";

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-slate-400">
        {label}
      </label>
      {token.trim() ? (
        <DiscordMemberSelect
          token={token}
          sharedRoster={sharedRoster}
          value={value}
          onPickUserId={onChange}
          label={rosterReady ? undefined : "Server roster"}
          disabled={disabled}
        />
      ) : null}
      {!rosterReady && (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          inputMode="numeric"
          disabled={disabled}
          placeholder="Discord user id"
          className="box-border min-w-0 w-full max-w-full hb-input px-3 py-2.5 text-base text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      )}
      {canUseActor && (
        <button
          type="button"
          disabled={disabled}
          className="text-xs text-blue-400 hover:underline disabled:opacity-50"
          onClick={() => onChange(actorId.trim())}
        >
          Use me (actor)
        </button>
      )}
    </div>
  );
}
