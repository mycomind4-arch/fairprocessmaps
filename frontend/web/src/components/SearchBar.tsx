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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
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

  // Close results on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const typeIcon = (type: string) => {
    switch (type) {
      case "property": return "🏠";
      case "evidence": return "📄";
      case "timeline": return "📅";
      default: return "•";
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search properties, evidence, addresses..."
          className="w-full pl-9 pr-9 py-1.5 text-sm border border-fp-gray-200 rounded-lg bg-fp-gray-50 focus:outline-none focus:ring-2 focus:ring-fp-blue/20 focus:border-fp-blue transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-gray-400 animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-lg border border-fp-gray-200 shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                onSelectResult(r);
                setShowResults(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-fp-gray-50 border-b border-fp-gray-100 last:border-0 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0">{typeIcon(r.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  {r.snippet && (
                    <div className="text-xs text-fp-gray-400 truncate mt-0.5">
                      {r.snippet}
                    </div>
                  )}
                  <div className="text-[10px] text-fp-gray-400 uppercase mt-0.5">
                    {r.type}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-lg border border-fp-gray-200 shadow-lg z-50 px-3 py-2 text-sm text-fp-gray-400">
          No results found
        </div>
      )}
    </div>
  );
}
