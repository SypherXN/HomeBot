/**
 * Natural-language parsing for the quick-add composer.
 * Turns one line of text into a routed creation intent for buy list,
 * wishlist, calendar task/event, or budget expense.
 */

export type QuickAddKind = "buy" | "wishlist" | "task" | "event" | "expense";

export type QuickAddIntent =
  | { kind: "buy"; name: string; store?: string }
  | { kind: "wishlist"; name: string }
  | { kind: "task"; title: string }
  | { kind: "event"; title: string; /** YYYY-MM-DD */ date: string; /** HH:mm 24h */ time: string }
  | { kind: "expense"; amount: string; merchant: string };

const KIND_WORDS: Record<string, QuickAddKind> = {
  buy: "buy",
  groceries: "buy",
  grocery: "buy",
  wish: "wishlist",
  wishlist: "wishlist",
  want: "wishlist",
  task: "task",
  todo: "task",
  event: "event",
  meeting: "event",
  appt: "event",
  appointment: "event",
  spent: "expense",
  expense: "expense",
  paid: "expense",
};

/** Parse "$12.50 groceries" / "spent 12 on groceries" / "12 groceries". */
function parseExpense(text: string): QuickAddIntent | null {
  const money = text.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!money) return null;
  const amount = money[1].replace(",", ".");
  const rest = (text.slice(0, money.index) + " " + text.slice((money.index ?? 0) + money[0].length))
    .replace(/\b(spent|expense|paid|on|for|cost|costs)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { kind: "expense", amount, merchant: rest || "Quick add" };
}

/** Parse a date word + optional clock time out of the trailing text. */
function parseWhen(text: string, now: Date): { date: string; time: string; rest: string } {
  let rest = text;
  const dayMs = 86400000;
  let date = now;

  const dayMatch = rest.match(/\b(today|tonight|tomorrow|tmrw|tmr)\b/i);
  if (dayMatch) {
    if (/tomorrow|tmrw|tmr/i.test(dayMatch[1])) date = new Date(now.getTime() + dayMs);
    rest = rest.replace(dayMatch[0], " ");
  }

  let time = "";
  const timeMatch = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? rest.match(/\b(\d{1,2}):(\d{2})\b/);
  if (timeMatch) {
    let h = Number(timeMatch[1]);
    const m = Number(timeMatch[2] ?? "0");
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    if (h < 24 && m < 60) time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    rest = rest.replace(timeMatch[0], " ");
  }

  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
  return { date: ymd, time, rest: rest.replace(/\s+/g, " ").trim() };
}

/**
 * Route one line of input to a creation intent.
 * Examples:
 *   "buy milk @costco"        → buy
 *   "milk @costco"            → buy (bare text defaults to buy list)
 *   "task water the plants"   → task
 *   "event dinner tomorrow 6pm" / "dentist 2:30pm" (no prefix → needs explicit kind) → event
 *   "wish standing desk"      → wishlist
 *   "$12.50 chipotle" / "spent 12 on groceries" → expense
 */
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddIntent | null {
  const text = input.trim();
  if (!text) return null;

  const firstWord = text.split(/\s+/)[0].toLowerCase().replace(/:$/, "");
  const explicit = KIND_WORDS[firstWord];
  const body = explicit ? text.slice(text.split(/\s+/)[0].length).trim() : text;

  if (explicit === "expense" || (!explicit && /\$\s*\d/.test(text))) {
    return parseExpense(explicit ? body : text);
  }

  if (explicit === "wishlist") return body ? { kind: "wishlist", name: body } : null;

  if (explicit === "task") return body ? { kind: "task", title: body } : null;

  if (explicit === "event") {
    const when = parseWhen(body, now);
    if (!when.rest) return null;
    return { kind: "event", title: when.rest, date: when.date, time: when.time || "09:00" };
  }

  if (explicit === "buy" || !explicit) {
    const storeMatch = body.match(/@([\w '&-]+)$/);
    const store = storeMatch ? storeMatch[1].trim() : undefined;
    const name = storeMatch ? body.slice(0, storeMatch.index).trim() : body;
    if (!name) return null;
    return { kind: "buy", name, store };
  }

  return null;
}

export const QUICK_ADD_KIND_LABEL: Record<QuickAddKind, string> = {
  buy: "Buy list",
  wishlist: "Wishlist",
  task: "Task",
  event: "Event",
  expense: "Expense",
};

export const QUICK_ADD_EXAMPLES = [
  "milk @costco",
  "task water the plants",
  "event dinner tomorrow 6pm",
  "$12.50 chipotle",
  "wish standing desk",
];
