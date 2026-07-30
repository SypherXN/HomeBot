import type { BudgetAuditEntry } from "../../api";
import type { DiscordGuildRosterState } from "../../hooks/useDiscordGuildRoster";

type Props = {
  entries: BudgetAuditEntry[];
  roster?: DiscordGuildRosterState | null;
};

function actorLabel(actorUserId: string, roster?: DiscordGuildRosterState | null): string {
  const member = roster?.data?.members.find((m) => m.userId === actorUserId);
  return member?.displayName ?? member?.username ?? `User ${actorUserId.slice(-4)}`;
}

function parseData(dataJson: string | null): Record<string, unknown> | null {
  if (!dataJson?.trim()) return null;
  try {
    return JSON.parse(dataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function humanize(entry: BudgetAuditEntry, roster?: DiscordGuildRosterState | null): string {
  const who = actorLabel(entry.actorUserId, roster);
  const data = parseData(entry.dataJson);
  const { entityType, action, entityId } = entry;

  switch (`${entityType}:${action}`) {
    case "transaction:create":
      return `${who} added a transaction (#${entityId}).`;
    case "transaction:update":
      return `${who} updated transaction #${entityId}.`;
    case "transaction:delete":
      return `${who} deleted transaction #${entityId}.`;
    case "transaction:transfer":
      return `${who} recorded a transfer (#${entityId}).`;
    case "category:create":
      return `${who} created category #${entityId}.`;
    case "category:update":
      return `${who} updated category #${entityId}.`;
    case "category:delete":
      return `${who} deleted category #${entityId}.`;
    case "account:create":
      return `${who} added account #${entityId}.`;
    case "account:archive":
      return `${who} archived account #${entityId}.`;
    case "account:activate":
      return `${who} restored account #${entityId}.`;
    case "account:opening_balance":
      return `${who} set an opening balance on account #${entityId}.`;
    case "envelope:set":
      return `${who} set envelope targets${data?.month ? ` for ${String(data.month)}` : ""}.`;
    case "envelope:roll":
      return `${who} rolled envelopes from ${String(data?.fromMonth ?? "?")} to ${String(data?.toMonth ?? "?")} (${String(data?.mode ?? "remaining")}).`;
    case "goal:create":
      return `${who} created savings goal #${entityId}.`;
    case "goal:update":
      return `${who} updated goal #${entityId}.`;
    case "goal:delete":
      return `${who} deleted goal #${entityId}.`;
    case "bill:create":
      return `${who} added bill #${entityId}.`;
    case "bill:update":
      return `${who} updated bill #${entityId}.`;
    case "bill:skip":
      return `${who} skipped bill #${entityId} for ${String(data?.month ?? "this month")}.`;
    case "bill:unskip":
      return `${who} unskipped bill #${entityId} for ${String(data?.month ?? "this month")}.`;
    case "bill:link_calendar":
      return `${who} linked bill #${entityId} to the calendar.`;
    case "bill:unlink_calendar":
      return `${who} unlinked bill #${entityId} from the calendar.`;
    case "bill:activate":
    case "bill:deactivate":
      return `${who} ${action === "activate" ? "reactivated" : "deactivated"} bill #${entityId}.`;
    case "recurring:create":
      return `${who} set up recurring transaction #${entityId}.`;
    case "recurring:update":
      return `${who} updated recurring #${entityId}.`;
    case "recurring:activate":
    case "recurring:deactivate":
      return `${who} ${action === "activate" ? "enabled" : "paused"} recurring #${entityId}.`;
    case "income_plan:set":
      return `${who} updated the income plan for ${String(data?.month ?? "the month")}.`;
    case "month_note:set":
      return `${who} saved a note for ${String(data?.month ?? "the month")}.`;
    case "month_note:close":
      return `${who} closed ${String(data?.month ?? "the month")}.`;
    case "exchange_rate:set":
      return `${who} updated an exchange rate.`;
    default:
      return `${who} ${action} ${entityType} #${entityId}.`;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function BudgetActivityFeed({ entries, roster }: Props) {
  return (
    <section className="hb-card p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <p className="text-slate-200">{humanize(e, roster)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{relativeTime(e.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
