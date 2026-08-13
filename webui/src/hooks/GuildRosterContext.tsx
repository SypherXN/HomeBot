import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDiscordGuildRoster, type DiscordGuildRosterState } from "./useDiscordGuildRoster";

const emptyRoster: DiscordGuildRosterState = { data: null, loading: false, error: null };

const GuildRosterContext = createContext<DiscordGuildRosterState>(emptyRoster);

/** One guild-member fetch for the signed-in session; used to show Discord usernames. */
export function GuildRosterProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const roster = useDiscordGuildRoster(token);
  return <GuildRosterContext.Provider value={roster}>{children}</GuildRosterContext.Provider>;
}

export function useGuildRoster(): DiscordGuildRosterState {
  return useContext(GuildRosterContext);
}
