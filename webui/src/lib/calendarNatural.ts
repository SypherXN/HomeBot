import { DateTime } from "luxon";

/**
 * Calendar-scoped natural-language create. Parses a compact phrase like
 * "dentist thursday 3pm 1h" into structured fields to pre-fill the add sheet.
 * Deliberately conservative: only strips recognized date/time/duration tokens and
 * leaves the rest as the title.
 */

export type NlParse = {
  title: string;
  /** YYYY-MM-DD in the given zone when a date was recognized. */
  ymd?: string;
  /** HH:mm 24h when a time was recognized. */
  startTime?: string;
  /** HH:mm end, derived from a duration token when present. */
  endTime?: string;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i;
const DURATION_RE = /^(\d+(?:\.\d+)?)(m|min|mins|h|hr|hrs|hour|hours)$/i;
const MONTH_DAY_RE = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i;
const DAY_MONTH_RE = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/i;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

export function parseNaturalCreate(input: string, zone: string): NlParse | null {
  const raw = input.trim();
  if (!raw) return null;
  const now = DateTime.now().setZone(zone);
  const tokens = raw.split(/\s+/);
  const consumed = new Array(tokens.length).fill(false);

  let ymd: string | undefined;
  let startMinutes: number | undefined;
  let durationMinutes: number | undefined;

  const setYmd = (d: DateTime) => {
    if (d.isValid) ymd = d.toISODate()!;
  };

  // Pass 1: multi-word and single date tokens.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (t === "today") { setYmd(now); consumed[i] = true; continue; }
    if (t === "tomorrow" || t === "tmrw" || t === "tmr") { setYmd(now.plus({ days: 1 })); consumed[i] = true; continue; }
    if (t === "tonight") { setYmd(now); consumed[i] = true; continue; }
    if (t === "next" && i + 1 < tokens.length && WEEKDAYS[tokens[i + 1].toLowerCase()] != null) {
      setYmd(nextWeekday(now, WEEKDAYS[tokens[i + 1].toLowerCase()], true));
      consumed[i] = consumed[i + 1] = true;
      i++;
      continue;
    }
    if (WEEKDAYS[t] != null) {
      setYmd(nextWeekday(now, WEEKDAYS[t], false));
      consumed[i] = true;
      continue;
    }
    const iso = t.match(ISO_RE);
    if (iso) { setYmd(DateTime.fromISO(t, { zone })); consumed[i] = true; continue; }
    const md = t.replace(/,/g, "").match(/^([a-z]+)$/);
    // "july 4" or "4 july" split across two tokens.
    const two = i + 1 < tokens.length ? `${t} ${tokens[i + 1].toLowerCase().replace(/,/g, "")}` : "";
    let m = two.match(MONTH_DAY_RE);
    if (m && MONTHS[m[1]] != null) {
      setYmd(monthDay(now, MONTHS[m[1]], parseInt(m[2], 10)));
      consumed[i] = consumed[i + 1] = true; i++; continue;
    }
    m = two.match(DAY_MONTH_RE);
    if (m && MONTHS[m[2]] != null) {
      setYmd(monthDay(now, MONTHS[m[2]], parseInt(m[1], 10)));
      consumed[i] = consumed[i + 1] = true; i++; continue;
    }
    if (md && MONTHS[md[1]] != null && i + 1 < tokens.length && /^\d{1,2}(st|nd|rd|th)?$/i.test(tokens[i + 1])) {
      setYmd(monthDay(now, MONTHS[md[1]], parseInt(tokens[i + 1], 10)));
      consumed[i] = consumed[i + 1] = true; i++; continue;
    }
    const slash = t.match(SLASH_RE);
    if (slash) {
      const mo = parseInt(slash[1], 10);
      const da = parseInt(slash[2], 10);
      const yr = slash[3] ? normalizeYear(parseInt(slash[3], 10), now.year) : now.year;
      setYmd(rollToFuture(DateTime.fromObject({ year: yr, month: mo, day: da }, { zone }), now, slash[3] != null));
      consumed[i] = true; continue;
    }
  }

  // Pass 2: time and duration tokens.
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const t = tokens[i].toLowerCase();
    if (t === "noon" || t === "midday") { startMinutes = 12 * 60; consumed[i] = true; continue; }
    if (t === "midnight") { startMinutes = 0; consumed[i] = true; continue; }
    const dur = t.match(DURATION_RE);
    if (dur) {
      const n = parseFloat(dur[1]);
      durationMinutes = /m/.test(dur[2]) && !/h/.test(dur[2]) ? Math.round(n) : Math.round(n * 60);
      consumed[i] = true; continue;
    }
    const tm = t.match(TIME_RE);
    if (tm && (tm[3] != null || (tm[2] != null && tm[3] == null) || /^([1-9]|1[0-2])(am|pm)$/.test(t))) {
      let hh = parseInt(tm[1], 10);
      const mm = tm[2] ? parseInt(tm[2], 10) : 0;
      const ap = tm[3]?.toLowerCase();
      if (ap) {
        const pm = ap.startsWith("p");
        if (hh === 12) hh = pm ? 12 : 0;
        else if (pm) hh += 12;
      }
      if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
        startMinutes = hh * 60 + mm;
        consumed[i] = true;
      }
      continue;
    }
  }

  const title = tokens.filter((_, i) => !consumed[i]).join(" ").trim();
  if (!title) return null;

  const out: NlParse = { title };
  if (ymd) out.ymd = ymd;
  if (startMinutes != null) {
    out.startTime = minutesToHm(startMinutes);
    if (durationMinutes != null) {
      const end = startMinutes + durationMinutes;
      if (end < 24 * 60) out.endTime = minutesToHm(end);
    }
  }
  return out;
}

function minutesToHm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function nextWeekday(now: DateTime, weekday: number, forceNextWeek: boolean): DateTime {
  const today = now.weekday % 7; // luxon Monday=1..Sunday=7 → convert to 0..6 (Sun=0)
  const todayZero = now.weekday === 7 ? 0 : now.weekday;
  let delta = (weekday - todayZero + 7) % 7;
  if (delta === 0 || forceNextWeek) delta = delta === 0 ? 7 : delta + 7;
  void today;
  return now.plus({ days: delta });
}

function monthDay(now: DateTime, month: number, day: number): DateTime {
  const d = DateTime.fromObject({ year: now.year, month, day }, { zone: now.zone });
  return rollToFuture(d, now, false);
}

function rollToFuture(d: DateTime, now: DateTime, hasExplicitYear: boolean): DateTime {
  if (!d.isValid) return d;
  if (!hasExplicitYear && d < now.startOf("day")) d = d.plus({ years: 1 });
  return d;
}

function normalizeYear(y: number, currentYear: number): number {
  if (y < 100) return 2000 + y;
  return y || currentYear;
}
