import type { BudgetAuditEntry } from "../../api";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";
import BudgetActivityFeed from "./BudgetActivityFeed";

type Props = {
  entries: BudgetAuditEntry[];
  roster?: DiscordGuildRosterState | null;
};

export default function BudgetAuditLog({ entries, roster }: Props) {
  return <BudgetActivityFeed entries={entries} roster={roster} />;
}
