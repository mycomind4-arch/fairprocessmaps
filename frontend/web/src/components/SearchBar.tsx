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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
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
      property: "text-fp-cyan border-fp-cyan/30",
      evidence: "text-fp-purple border-fp-purple/30",
      timeline: "text-fp-amber border-fp-amber/30",
    };
    return styles[type] || "text-fp-text-dim border-fp-border";
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search properties, evidence, addresses..."
          className="w-full pl-10 pr-9 py-2 text-sm rounded-xl bg-fp-surface border border-fp-border text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue/50 focus:ring-2 focus:ring-fp-blue/10 transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full glass rounded-xl shadow-2xl shadow-black/40 z-50 max-h-80 overflow-y-auto animate-[slide-down_0.2s_ease-out]">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                onSelectResult(r);
                setShowResults(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-fp-surface-2 border-b border-fp-border last:border-0 transition-colors group"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-text group-hover:text-white transition-colors truncate">
                    {r.title}
                  </div>
                  {r.snippet && (
                    <div className="text-xs text-fp-text-dim truncate mt-0.5">{r.snippet}</div>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeBadge(r.type)} uppercase font-medium shrink-0`}>
                  {r.type}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-full glass rounded-xl shadow-2xl z-50 px-3 py-2.5 text-sm text-fp-text-dim animate-[slide-down_0.2s_ease-out]">
          No results found
        </div>
      )}
    </div>
  );
}
