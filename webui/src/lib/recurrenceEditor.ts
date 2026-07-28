/**
 * Shared model for the recurrence editor: presets + weekly day checkboxes + an optional
 * end (never / on date / after N occurrences). Serializes to the compact string the API stores.
 */

export type RecurrencePreset = "" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";
export type RecurrenceEndKind = "never" | "until" | "count";

export type RecurrenceEditorState = {
  preset: RecurrencePreset;
  /** Days for preset "weekly" (0 = Sunday … 6 = Saturday). Always non-empty when preset is weekly. */
  weeklyDays: number[];
  endKind: RecurrenceEndKind;
  /** YYYY-MM-DD when endKind === "until". */
  untilDate: string;
  /** Positive integer as a string when endKind === "count". */
  count: string;
};

export const DEFAULT_WEEKLY_DAYS = [1]; // Monday

export function emptyRecurrence(): RecurrenceEditorState {
  return { preset: "", weeklyDays: [...DEFAULT_WEEKLY_DAYS], endKind: "never", untilDate: "", count: "3" };
}

const DAY_CODE_TO_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};
const INDEX_TO_DAY_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Parse a stored recurrence string into editor state. */
export function parseRecurrence(raw: string): RecurrenceEditorState {
  const state = emptyRecurrence();
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return state;

  // Split off an until/count suffix first.
  let core = s;
  const semi = core.indexOf(";");
  if (semi >= 0) {
    const suffix = core.slice(semi + 1);
    core = core.slice(0, semi);
    for (const part of suffix.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim().toUpperCase();
      const val = part.slice(eq + 1).trim();
      if (key === "UNTIL" && /^\d{8}$/.test(val)) {
        state.endKind = "until";
        state.untilDate = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
      } else if (key === "COUNT" && /^\d+$/.test(val)) {
        state.endKind = "count";
        state.count = String(parseInt(val, 10));
      }
    }
  }

  const colon = core.indexOf(":");
  const freqToken = colon >= 0 ? core.slice(0, colon) : core;
  const byDay = colon >= 0 ? core.slice(colon + 1) : "";

  if (freqToken === "daily") state.preset = "daily";
  else if (freqToken === "monthly") state.preset = "monthly";
  else if (freqToken === "yearly" || freqToken === "annual") state.preset = "yearly";
  else if (freqToken === "biweekly") state.preset = "biweekly";
  else if (freqToken === "weekly") {
    const days = byDay
      .split(",")
      .map((t) => DAY_CODE_TO_INDEX[t.trim().toUpperCase()])
      .filter((n): n is number => typeof n === "number");
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    const isWeekdays = sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d));
    if (isWeekdays) {
      state.preset = "weekdays";
    } else {
      state.preset = "weekly";
      state.weeklyDays = sorted.length > 0 ? sorted : [...DEFAULT_WEEKLY_DAYS];
    }
  } else {
    state.preset = "";
  }
  return state;
}

/** Serialize editor state to the stored recurrence string ("" when preset is none). */
export function formatRecurrence(state: RecurrenceEditorState): string {
  let core = "";
  switch (state.preset) {
    case "":
      return "";
    case "daily":
      core = "daily";
      break;
    case "monthly":
      core = "monthly";
      break;
    case "yearly":
      core = "yearly";
      break;
    case "biweekly":
      core = "biweekly";
      break;
    case "weekdays":
      core = "weekly:MO,TU,WE,TH,FR";
      break;
    case "weekly": {
      const days = state.weeklyDays.length > 0 ? state.weeklyDays : DEFAULT_WEEKLY_DAYS;
      const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday-first
      core = `weekly:${sorted.map((d) => INDEX_TO_DAY_CODE[d]).join(",")}`;
      break;
    }
  }
  if (state.endKind === "until" && /^\d{4}-\d{2}-\d{2}$/.test(state.untilDate)) {
    return `${core};UNTIL=${state.untilDate.replace(/-/g, "")}`;
  }
  if (state.endKind === "count") {
    const n = parseInt(state.count, 10);
    if (Number.isFinite(n) && n > 0) return `${core};COUNT=${n}`;
  }
  return core;
}
