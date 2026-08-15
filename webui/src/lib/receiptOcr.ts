/** Parse OCR'd receipt text into best-guess transaction fields. */
export type ReceiptGuess = {
  merchant?: string;
  amount?: string;
  date?: string;
};

const TOTAL_RE = /(?:total|amount due|balance due|sale)[^0-9]{0,12}(\d{1,6}[.,]\d{2})/i;
const ANY_MONEY_RE = /(\d{1,6}\.\d{2})/g;
const DATE_RES = [
  /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, // 07/30/2026 or 30/07/2026
  /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/, // 2026-07-30
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseMoney(s: string): number {
  return Number(s.replace(",", "."));
}

/** Heuristic receipt parser: first line as merchant, "total" line as amount, first date found. */
export function parseReceiptText(text: string): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const guess: ReceiptGuess = {};

  // Merchant: first line that looks like a name (mostly letters, not a date/phone).
  for (const line of lines.slice(0, 5)) {
    const letters = (line.match(/[a-zA-Z]/g) ?? []).length;
    if (letters >= 3 && letters / line.length > 0.5 && !/receipt|invoice|order|date|tel|phone/i.test(line)) {
      guess.merchant = line.slice(0, 60);
      break;
    }
  }

  // Amount: prefer a line containing "total"; else largest money value.
  const totalMatch = text.match(TOTAL_RE);
  if (totalMatch) {
    guess.amount = parseMoney(totalMatch[1]).toFixed(2);
  } else {
    let max = 0;
    for (const m of text.matchAll(ANY_MONEY_RE)) {
      const v = parseMoney(m[1]);
      if (v > max && v < 100000) max = v;
    }
    if (max > 0) guess.amount = max.toFixed(2);
  }

  // Date: first plausible date.
  for (const line of lines.slice(0, 15)) {
    const mdy = line.match(DATE_RES[0]);
    if (mdy) {
      const [, a, b, y] = mdy;
      let m = Number(a), d = Number(b);
      if (m > 12 && d <= 12) [m, d] = [d, m];
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        guess.date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        break;
      }
    }
    const ymd = line.match(DATE_RES[1]);
    if (ymd) {
      const [, y, m, d] = ymd;
      guess.date = `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
      break;
    }
    const named = line.match(DATE_RES[2]);
    if (named) {
      const [, d, mon, y] = named;
      const mm = MONTHS[mon.slice(0, 3).toLowerCase()];
      if (mm) {
        guess.date = `${y}-${mm}-${String(Number(d)).padStart(2, "0")}`;
        break;
      }
    }
  }

  return guess;
}
