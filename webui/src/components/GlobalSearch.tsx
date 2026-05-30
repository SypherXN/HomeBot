import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSearch, type SearchHit, type SearchResult } from "../api";

type Props = {
  token: string;
};

function domainLabel(domain: string): string {
  switch (domain) {
    case "buy":
      return "Buy";
    case "wishlist":
      return "Wishlist";
    case "budget":
      return "Budget";
    case "calendar":
      return "Calendar";
    default:
      return domain;
  }
}

function HitRow({ hit }: { hit: SearchHit }) {
  return (
    <Link
      to={hit.path}
      className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-800"
      onClick={() => {}}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {domainLabel(hit.domain)}
      </span>
      <div className="font-medium text-slate-100">{hit.title}</div>
      {hit.subtitle ? <div className="truncate text-xs text-slate-500">{hit.subtitle}</div> : null}
    </Link>
  );
}

export default function GlobalSearch({ token }: Props) {
  const tok = token.trim();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!tok || query.trim().length < 2) {
      setResult(null);
      setErr(null);
      return;
    }
    const t = window.setTimeout(() => {
      setBusy(true);
      setErr(null);
      void getSearch(tok, query.trim())
        .then(setResult)
        .catch((e) => {
          setResult(null);
          setErr(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [tok, query]);

  const hits: SearchHit[] = result
    ? [...result.buy, ...result.wishlist, ...result.budget, ...result.calendar]
    : [];

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 sm:max-w-xs">
      <input
        id="global-search-input"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={tok ? "Search household…" : "Sign in to search"}
        disabled={!tok}
        className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        aria-expanded={open}
        aria-controls="global-search-results"
      />
      {open && tok && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl"
        >
          {busy ? <p className="px-3 py-2 text-xs text-slate-500">Searching…</p> : null}
          {err ? <p className="px-3 py-2 text-xs text-red-300">{err}</p> : null}
          {!busy && !err && hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No matches.</p>
          ) : null}
          {!busy && hits.length > 0
            ? hits.map((h) => <HitRow key={`${h.domain}-${h.id}`} hit={h} />)
            : null}
        </div>
      ) : null}
    </div>
  );
}
