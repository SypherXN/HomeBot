import type { CSSProperties } from "react";

/** Tabular-figure money text — keeps digits column-aligned like Monarch/Copilot tables. */
export const MONEY_TEXT = "font-mono tabular-nums tracking-tight";

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed display money with +/− prefix. */
export function formatSignedMoney(n: number): string {
  return `${n < 0 ? "−" : "+"}$${formatMoney(Math.abs(n))}`;
}

export function formatMonthLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Dot style for a category color string (hex or CSS color); empty → neutral slate dot. */
export function categoryDotStyle(color: string | null | undefined): CSSProperties {
  const c = color?.trim();
  return { backgroundColor: c || "#64748b" };
}
