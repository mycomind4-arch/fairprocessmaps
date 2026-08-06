"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { SearchResult } from "@/lib/types";

interface SearchBarProps {
  onSelectResult: (result: SearchResult) => void;
}

export default function SearchBar({ onSelectResult }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query.trim(), { limit: 10 });
        setResults(res);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const typeBadge = (type: string) => {
    const styles: Record<string, string> = {
      property: "text-fp-blue border-fp-blue/30 bg-fp-blue/10",
      evidence: "text-fp-cyan border-fp-cyan/30 bg-fp-cyan/10",
      timeline: "text-fp-amber border-fp-amber/30 bg-fp-amber/10",
    };
    return styles[type] || "text-fp-text-dim border-fp-border bg-fp-surface-2";
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search properties by address, APN, or evidence keywords..."
          className="w-full pl-11 pr-10 py-2.5 text-sm rounded-xl bg-fp-surface border border-fp-border text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all shadow-sm"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-blue animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full glass rounded-[14px] shadow-2xl shadow-black/40 z-50 max-h-80 overflow-y-auto animate-[slide-down_0.2s_ease-out] p-2 space-y-1">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                onSelectResult(r);
                setShowResults(false);
                setQuery("");
              }}
              className="w-full text-left p-3 hover:bg-fp-surface-2 rounded-xl transition-colors group flex items-start gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-semibold text-fp-text group-hover:text-fp-blue transition-colors truncate">
                  {r.title}
                </div>
                {r.snippet && (
                  <div className="text-xs text-fp-text-muted truncate">{r.snippet}</div>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${typeBadge(r.type)} uppercase tracking-wide font-semibold shrink-0`}>
                {r.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {showResults && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full glass rounded-[14px] shadow-2xl z-50 p-4 text-center space-y-1 animate-[slide-down_0.2s_ease-out]">
          <div className="text-sm font-semibold text-fp-text">No matching records found</div>
          <div className="text-xs text-fp-text-muted">
            Try searching by parcel APN, street address, or document record ID.
          </div>
        </div>
      )}
    </div>
  );
}
