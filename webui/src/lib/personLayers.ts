/**
 * Per-person calendar layer colors. A stable palette keyed by assignee so each household
 * member's events share a color across views. "Everyone"/unassigned use the neutral layer.
 */

export type PersonLayer = {
  /** Discriminates who an event belongs to. */
  key: string;
  /** Tailwind classes for a solid chip (bg/text/hover). */
  chip: string;
  /** Tailwind classes for a timed event block. */
  block: string;
  /** Small legend dot. */
  dot: string;
};

const EVERYONE: PersonLayer = {
  key: "everyone",
  chip: "bg-blue-900/60 text-blue-100 hover:bg-blue-800/70",
  block: "bg-blue-700/70 text-white hover:bg-blue-600/80",
  dot: "bg-blue-400",
};

// Ordered palette; index by hash of the assignee id for a stable assignment.
const PALETTE: Omit<PersonLayer, "key">[] = [
  { chip: "bg-cyan-900/60 text-cyan-100 hover:bg-cyan-800/70", block: "bg-cyan-600/70 text-white hover:bg-cyan-500/80", dot: "bg-cyan-400" },
  { chip: "bg-violet-900/60 text-violet-100 hover:bg-violet-800/70", block: "bg-violet-600/70 text-white hover:bg-violet-500/80", dot: "bg-violet-400" },
  { chip: "bg-emerald-900/60 text-emerald-100 hover:bg-emerald-800/70", block: "bg-emerald-600/70 text-white hover:bg-emerald-500/80", dot: "bg-emerald-400" },
  { chip: "bg-amber-900/60 text-amber-100 hover:bg-amber-800/70", block: "bg-amber-600/70 text-white hover:bg-amber-500/80", dot: "bg-amber-400" },
  { chip: "bg-rose-900/60 text-rose-100 hover:bg-rose-800/70", block: "bg-rose-600/70 text-white hover:bg-rose-500/80", dot: "bg-rose-400" },
  { chip: "bg-sky-900/60 text-sky-100 hover:bg-sky-800/70", block: "bg-sky-600/70 text-white hover:bg-sky-500/80", dot: "bg-sky-400" },
  { chip: "bg-fuchsia-900/60 text-fuchsia-100 hover:bg-fuchsia-800/70", block: "bg-fuchsia-600/70 text-white hover:bg-fuchsia-500/80", dot: "bg-fuchsia-400" },
  { chip: "bg-lime-900/60 text-lime-100 hover:bg-lime-800/70", block: "bg-lime-600/70 text-white hover:bg-lime-500/80", dot: "bg-lime-400" },
];

export function everyoneLayer(): PersonLayer {
  return EVERYONE;
}

/** Stable layer for an assignee id ("" or "0" → the everyone layer). */
export function layerForAssignee(assignedTo: string | null | undefined): PersonLayer {
  const id = (assignedTo ?? "").trim();
  if (!id || id === "0") return EVERYONE;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const p = PALETTE[h % PALETTE.length];
  return { key: id, ...p };
}
