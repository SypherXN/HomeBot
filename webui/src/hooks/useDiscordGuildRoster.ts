import { useEffect, useState } from "react";
import {
  getDiscordGuildMembers,
  type DiscordGuildMembersResponse,
} from "../api";

export type DiscordGuildRosterState = {
  data: DiscordGuildMembersResponse | null;
  loading: boolean;
  error: string | null;
};

/** One GET /api/discord/guild/members per token change (shared across pickers on feature pages). */
export function useDiscordGuildRoster(token: string): DiscordGuildRosterState {
  const [data, setData] = useState<DiscordGuildMembersResponse | null>(null);
  const [loading, setLoading] = useState(() => Boolean(token.trim()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = token.trim();
    if (!t) {
      setData(null);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    getDiscordGuildMembers(t, ac.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [token]);

  return { data, loading, error };
}
