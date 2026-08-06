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
  AlertCircle,
  Filter,
  ShieldCheck,
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
    <div className="space-y-6 pb-8 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Legal &amp; Law Library</h2>
        <p className="text-sm text-fp-text-muted mt-1">
          California code enforcement statutes, case law citations, and due process requirements
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-3 border-b border-fp-border pb-4">
        <button
          onClick={() => setActiveTab("library")}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === "library"
              ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40 shadow-sm"
              : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Reference Library
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-fp-surface-2 text-fp-text-dim">
            {legalReferences.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("agent-statutes")}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === "agent-statutes"
              ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40 shadow-sm"
              : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
          }`}
        >
          <ScanLine className="w-4 h-4" />
          Active Agent Statutes
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-fp-surface-2 text-fp-text-dim">
            {STATUTES.length}
          </span>
        </button>
      </div>

      {activeTab === "library" && (
        <div className="space-y-6">
          {/* Prominent Top Search Bar */}
          <div className="relative">
            <Search className="w-5 h-5 text-fp-text-dim absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search statutes, case citations, legal topics, or keywords…"
              className="w-full pl-12 pr-4 py-4 rounded-[14px] glass shadow-lg shadow-black/20 text-base text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/30 transition-all"
            />
          </div>

          {/* Type Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-fp-text-dim shrink-0 mr-1" />
            {(["all", "statute", "case-law", "notice-requirement", "regulation"] as const).map((type) => {
              const meta = type !== "all" ? TYPE_META[type] : null;
              const isActive = activeType === type;
              const count = typeCounts[type] ?? 0;
              const Icon = meta?.icon;
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/40 shadow-sm"
                      : "bg-fp-surface/60 text-fp-text-muted border border-fp-border hover:border-fp-border-hover hover:text-fp-text"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {type === "all" ? "All Types" : meta?.label}
                  <span className="text-fp-text-dim font-mono text-[11px] ml-0.5">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Results Count Metadata */}
          <div className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">
            Showing {filtered.length} {filtered.length === 1 ? "reference" : "references"}
            {search && ` matching "${search}"`}
          </div>

          {/* Reference Cards */}
          <div className="grid gap-4">
            {filtered.map((ref) => {
              const meta = TYPE_META[ref.type];
              const isOpen = expanded.has(ref.id);
              return (
                <div
                  key={ref.id}
                  className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-fp-blue/40 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Code/Section Number Monospace Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-fp-blue/15 text-fp-blue border border-fp-blue/30 tracking-wider">
                          {ref.citation}
                        </span>
                        <span className="text-xs text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2.5 py-1 rounded-md border border-fp-border font-medium">
                          {CATEGORY_LABELS[ref.category]}
                        </span>
                        {ref.noticeDays != null && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-fp-amber/15 text-fp-amber border border-fp-amber/30">
                            <Clock className="w-3.5 h-3.5" />
                            {ref.noticeDays === 0 ? "Emergency" : `${ref.noticeDays} days notice`}
                          </span>
                        )}
                      </div>

                      {/* Main Statute Title */}
                      <h3 className="text-base font-semibold text-fp-text leading-snug">
                        {ref.title}
                      </h3>

                      {/* Metadata Line */}
                      <div className="flex items-center gap-4 text-xs text-fp-text-dim">
                        <span><strong className="text-fp-text-muted font-normal">Authority:</strong> {ref.authority}</span>
                        <span>•</span>
                        <span><strong className="text-fp-text-muted font-normal">Updated:</strong> {ref.lastUpdated}</span>
                      </div>
                    </div>

                    {/* Open / Close Action */}
                    <button
                      onClick={() => toggle(ref.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-blue/15 hover:border-fp-blue/40 hover:text-fp-blue text-xs font-medium text-fp-text transition-all shrink-0"
                    >
                      <span>{isOpen ? "Close" : "Open"}</span>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Body Details when expanded */}
                  {isOpen && (
                    <div className="pt-4 border-t border-fp-border space-y-4">
                      <p className="text-sm text-fp-text-muted leading-relaxed">{ref.summary}</p>
                      <div>
                        <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider mb-2">
                          Key Points
                        </h4>
                        <ul className="space-y-2">
                          {ref.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-fp-text-muted">
                              <span className="text-fp-blue shrink-0 mt-0.5">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="rounded-[14px] glass border-dashed border-fp-border p-12 text-center shadow-lg shadow-black/20">
                <AlertCircle className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
                <h3 className="text-base font-semibold text-fp-text">No legal references found</h3>
                <p className="text-sm text-fp-text-muted mt-2">
                  Try adjusting your search terms or filter selections to find relevant statutes or cases.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "agent-statutes" && (
        <div className="space-y-6">
          {/* Agent Statutes Info Banner */}
          <div className="rounded-[14px] glass border border-fp-blue/30 bg-fp-blue/5 p-6 shadow-lg shadow-black/20">
            <div className="flex items-start gap-4">
              <ShieldCheck className="w-6 h-6 text-fp-blue shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-fp-text">Statutes Actively Checked by Analysis Agents</h3>
                <p className="text-sm text-fp-text-muted mt-1 leading-relaxed">
                  When the analysis agents execute, they automatically evaluate timeline events and
                  property records against these {STATUTES.length} statutory deadlines. Deviations are flagged as
                  findings in Due Process Analysis.
                </p>
              </div>
            </div>
          </div>

          {/* Active Statute Cards */}
          <div className="grid gap-4">
            {STATUTES.map((statute) => {
              const id = `statute-${statute.ref.replace(/[^a-zA-Z0-9]/g, "_")}`;
              const isOpen = expanded.has(id);
              return (
                <div
                  key={statute.ref}
                  className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-fp-blue/40 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-fp-blue/15 text-fp-blue border border-fp-blue/30 tracking-wider">
                          {statute.ref}
                        </span>
                        <span className="text-xs text-fp-text-dim uppercase tracking-wide bg-fp-surface-2 px-2.5 py-1 rounded-md border border-fp-border font-medium">
                          {STATUTE_CATEGORY_LABELS[statute.category]}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-fp-amber/15 text-fp-amber border border-fp-amber/30">
                          <Clock className="w-3.5 h-3.5" />
                          {statute.deadline_value} {statute.deadline_type === "business_days" ? "business" : "calendar"} {statute.deadline_value === 1 ? "day" : "days"}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-fp-text leading-snug">
                        {statute.title}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-fp-text-dim">
                        <span><strong className="text-fp-text-muted font-normal">Source:</strong> {statute.source}</span>
                        <span>•</span>
                        <span><strong className="text-fp-text-muted font-normal">Direction:</strong> {statute.deadline_direction === "max" ? "Maximum timeframe" : "Minimum notice required"}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggle(id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-blue/15 hover:border-fp-blue/40 hover:text-fp-blue text-xs font-medium text-fp-text transition-all shrink-0"
                    >
                      <span>{isOpen ? "Close" : "Open"}</span>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="pt-4 border-t border-fp-border space-y-3">
                      <p className="text-sm text-fp-text-muted leading-relaxed">{statute.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-[14px] glass border border-fp-border p-4 flex items-start gap-3 shadow-md">
        <AlertCircle className="w-4 h-4 text-fp-text-dim shrink-0 mt-0.5" />
        <p className="text-xs text-fp-text-dim leading-relaxed">
          This library is for informational purposes only and does not constitute legal advice.
          Always verify current statutory text with a qualified legal professional before relying on any reference.
        </p>
      </div>
    </div>
  );
}
