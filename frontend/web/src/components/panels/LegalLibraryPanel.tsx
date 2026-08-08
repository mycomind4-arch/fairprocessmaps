"use client";

import { useState, useMemo } from "react";
import {
  Search,
  BookOpen,
  Gavel,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  Filter,
  ScanLine,
} from "lucide-react";
import { legalReferences, type LegalReference } from "@/lib/legal-data";
import { STATUTES, type StatuteRule } from "@/lib/statutes";

const TYPE_META: Record<LegalReference["type"], { label: string; icon: typeof BookOpen }> = {
  statute: { label: "Statute", icon: BookOpen },
  "case-law": { label: "Case Law", icon: Gavel },
  regulation: { label: "Regulation", icon: FileText },
  "notice-requirement": { label: "Notice Requirement", icon: Clock },
};

const CATEGORY_LABELS: Record<LegalReference["category"], string> = {
  abatement: "Abatement",
  notice: "Notice Requirements",
  hearing: "Hearings",
  appeal: "Appeals",
  costs: "Cost Recovery",
  takings: "Takings",
  procedure: "Procedure",
  "substandard-housing": "Substandard Housing",
  cannabis: "Cannabis",
  "general-nuisance": "General Nuisance",
};

const STATUTE_CATEGORY_LABELS: Record<StatuteRule["category"], string> = {
  notice: "Notice",
  hearing: "Hearing",
  appeal: "Appeal",
  permit: "Permit",
  enforcement: "Enforcement",
  recording: "Recording",
};

export default function LegalLibraryPanel() {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<LegalReference["type"] | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"library" | "agent-statutes">("library");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return legalReferences.filter((ref) => {
      if (activeType !== "all" && ref.type !== activeType) return false;
      if (!q) return true;
      return (
        ref.citation.toLowerCase().includes(q) ||
        ref.title.toLowerCase().includes(q) ||
        ref.summary.toLowerCase().includes(q) ||
        ref.keyPoints.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [search, activeType]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: legalReferences.length };
    for (const ref of legalReferences) {
      counts[ref.type] = (counts[ref.type] ?? 0) + 1;
    }
    return counts;
  }, []);

  return (
    <div className="space-y-4 pb-8 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-fp-text">Legal &amp; Law Library</h2>
        <p className="text-sm text-fp-text-muted mt-0.5">
          California code enforcement statutes, case law citations, and due process requirements
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-3 border-b border-fp-border pb-3">
        <button
          onClick={() => setActiveTab("library")}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "library"
              ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40"
              : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Reference Library
          <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-fp-surface-2 text-fp-text-dim">
            {legalReferences.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("agent-statutes")}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "agent-statutes"
              ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40"
              : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
          }`}
        >
          <ScanLine className="w-4 h-4" />
          Active Agent Statutes
          <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-fp-surface-2 text-fp-text-dim">
            {STATUTES.length}
          </span>
        </button>
      </div>

      {activeTab === "library" && (
        <div className="space-y-4">
          {/* Search Bar - compact */}
          <div className="relative">
            <Search className="w-4 h-4 text-fp-text-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search statutes, case citations, legal topics…"
              aria-label="Search statutes and legal references"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl surface-flat text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-all"
            />
          </div>

          {/* Type Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
            {(["all", "statute", "case-law", "notice-requirement", "regulation"] as const).map((type) => {
              const meta = type !== "all" ? TYPE_META[type] : null;
              const isActive = activeType === type;
              const count = typeCounts[type] ?? 0;
              const Icon = meta?.icon;
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40"
                      : "bg-fp-surface/60 text-fp-text-muted border border-fp-border hover:border-fp-border-hover hover:text-fp-text"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {type === "all" ? "All Types" : meta?.label}
                  <span className="text-fp-text-dim font-mono text-[10px] ml-0.5">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Results Count */}
          <div className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">
            {filtered.length} {filtered.length === 1 ? "reference" : "references"}
            {search && ` matching "${search}"`}
          </div>

          {/* Reference Cards */}
          <div className="grid gap-3">
            {filtered.map((ref) => {
              const meta = TYPE_META[ref.type];
              const isOpen = expanded.has(ref.id);
              return (
                <div
                  key={ref.id}
                  className="rounded-xl surface-flat hover:border-fp-blue/40 transition-all space-y-3 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-fp-blue/15 text-fp-blue border border-fp-blue/30 tracking-wider">
                          {ref.citation}
                        </span>
                        <span className="text-[10px] text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2 py-0.5 rounded-md border border-fp-border font-medium">
                          {CATEGORY_LABELS[ref.category]}
                        </span>
                        {ref.noticeDays != null && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-fp-amber/15 text-fp-amber border border-fp-amber/30">
                            <Clock className="w-3 h-3" />
                            {ref.noticeDays === 0 ? "Emergency" : `${ref.noticeDays}d notice`}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-fp-text leading-snug">
                        {ref.title}
                      </h3>

                      <div className="flex items-center gap-3 text-xs text-fp-text-dim">
                        <span><strong className="text-fp-text-muted font-normal">Authority:</strong> {ref.authority}</span>
                        <span>•</span>
                        <span><strong className="text-fp-text-muted font-normal">Updated:</strong> {ref.lastUpdated}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggle(ref.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-blue/15 hover:border-fp-blue/40 hover:text-fp-blue text-xs font-medium text-fp-text transition-all shrink-0"
                    >
                      <span>{isOpen ? "Close" : "Open"}</span>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="pt-3 border-t border-fp-border space-y-3">
                      <p className="text-sm text-fp-text-muted leading-relaxed">{ref.summary}</p>
                      {ref.keyPoints.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Key Points</div>
                          {ref.keyPoints.map((point, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-fp-text-muted">
                              <span className="text-fp-blue text-xs mt-0.5">▸</span>
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "agent-statutes" && (
        <div className="space-y-3">
          {STATUTES.map((statute) => {
            const Icon = TYPE_META.statute.icon;
            return (
              <div key={statute.ref} className="rounded-xl surface-flat p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-fp-blue/15 text-fp-blue border border-fp-blue/30 tracking-wider">
                    {statute.ref}
                  </span>
                  <span className="text-[10px] text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2 py-0.5 rounded-md border border-fp-border font-medium">
                    {STATUTE_CATEGORY_LABELS[statute.category]}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-fp-amber/15 text-fp-amber border border-fp-amber/30">
                    <Clock className="w-3 h-3" />
                    {statute.deadline_value} days
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-fp-text">{statute.title}</h3>
                <p className="text-xs text-fp-text-muted leading-relaxed">{statute.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
