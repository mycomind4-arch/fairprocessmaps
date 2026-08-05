"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Scale,
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

const TYPE_META: Record<LegalReference["type"], { label: string; icon: typeof Scale; color: string }> = {
  statute: { label: "Statute", icon: BookOpen, color: "text-fp-blue" },
  "case-law": { label: "Case Law", icon: Gavel, color: "text-fp-purple" },
  regulation: { label: "Regulation", icon: FileText, color: "text-fp-cyan" },
  "notice-requirement": { label: "Notice Requirement", icon: Clock, color: "text-fp-amber" },
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
    <div className="space-y-5 pb-8 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-fp-text">Legal &amp; Law Library</h2>
        <p className="text-xs text-fp-text-dim mt-0.5">
          California code enforcement statutes, case law, and due process requirements
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-2 border-b border-fp-border pb-3">
        <button
          onClick={() => setActiveTab("library")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "library"
              ? "bg-fp-blue/15 text-fp-text border border-fp-blue/30"
              : "text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2/40 border border-transparent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Reference Library
          <span className="text-fp-text-dim text-xs">({legalReferences.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("agent-statutes")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "agent-statutes"
              ? "bg-fp-cyan/15 text-fp-cyan border border-fp-cyan/30"
              : "text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2/40 border border-transparent"
          }`}
        >
          <ScanLine className="w-4 h-4" />
          Active Agent Statutes
          <span className="text-fp-text-dim text-xs">({STATUTES.length})</span>
        </button>
      </div>

      {activeTab === "library" && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-fp-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search statutes, cases, keywords…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan transition-colors"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
            {(["all", "statute", "case-law", "notice-requirement", "regulation"] as const).map((type) => {
              const meta = type !== "all" ? TYPE_META[type] : null;
              const isActive = activeType === type;
              const count = typeCounts[type] ?? 0;
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-fp-blue/15 text-fp-text border border-fp-blue/40"
                      : "bg-fp-surface text-fp-text-muted border border-fp-border hover:border-fp-border-hover hover:text-fp-text"
                  }`}
                >
                  {meta && <meta.icon className="w-3 h-3" />}
                  {type === "all" ? "All" : meta?.label}
                  <span className="text-fp-text-dim ml-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Results count */}
          <div className="text-xs text-fp-text-dim">
            {filtered.length} {filtered.length === 1 ? "reference" : "references"}
            {search && ` matching "${search}"`}
          </div>

          {/* Reference cards */}
          <div className="space-y-3">
            {filtered.map((ref) => {
              const meta = TYPE_META[ref.type];
              const Icon = meta.icon;
              const isOpen = expanded.has(ref.id);
              return (
                <div
                  key={ref.id}
                  className="rounded-xl border border-fp-border bg-fp-surface/40 overflow-hidden transition-colors hover:border-fp-border-hover"
                >
                  <button
                    onClick={() => toggle(ref.id)}
                    className="w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className="shrink-0 mt-0.5">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-fp-text">{ref.title}</span>
                        {ref.noticeDays != null && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-fp-amber/15 text-fp-amber">
                            <Clock className="w-2.5 h-2.5" />
                            {ref.noticeDays === 0 ? "Emergency" : `${ref.noticeDays} days`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-fp-text-dim mt-0.5 font-mono">{ref.citation}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-fp-surface-2 text-fp-text-muted">
                        {CATEGORY_LABELS[ref.category]}
                      </span>
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-fp-text-dim" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-fp-text-dim" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pl-11 space-y-4">
                      <p className="text-sm text-fp-text-muted leading-relaxed">{ref.summary}</p>
                      <div>
                        <h4 className="text-[11px] font-semibold text-fp-text-dim uppercase tracking-wider mb-2">
                          Key Points
                        </h4>
                        <ul className="space-y-1.5">
                          {ref.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-fp-text-muted">
                              <span className="text-fp-cyan mt-0.5 shrink-0">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex items-center gap-4 pt-2 border-t border-fp-border text-[11px] text-fp-text-dim">
                        <span><span className="text-fp-text-muted">Authority:</span> {ref.authority}</span>
                        <span><span className="text-fp-text-muted">Updated:</span> {ref.lastUpdated}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-12 text-center">
                <AlertCircle className="w-8 h-8 text-fp-text-dim mx-auto mb-3" />
                <p className="text-sm text-fp-text">No references found</p>
                <p className="text-xs text-fp-text-dim mt-1">Try a different search term or filter</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "agent-statutes" && (
        <>
          {/* Agent statutes info banner */}
          <div className="rounded-xl border border-fp-cyan/20 bg-fp-cyan/5 p-4">
            <div className="flex items-start gap-3">
              <ScanLine className="w-5 h-5 text-fp-cyan shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-fp-text font-medium">Statutes Actively Checked by Analysis Agents</p>
                <p className="text-xs text-fp-text-dim mt-1">
                  When the analysis agents run, they automatically evaluate every timeline event and
                  record against these {STATUTES.length} statutory deadlines. Deviations are flagged as
                  findings in the Due Process Analysis panel.
                </p>
              </div>
            </div>
          </div>

          {/* Statute cards */}
          <div className="space-y-3">
            {STATUTES.map((statute) => {
              const id = `statute-${statute.ref.replace(/[^a-zA-Z0-9]/g, "_")}`;
              const isOpen = expanded.has(id);
              return (
                <div
                  key={statute.ref}
                  className="rounded-xl border border-fp-border bg-fp-surface/40 overflow-hidden transition-colors hover:border-fp-border-hover"
                >
                  <button
                    onClick={() => toggle(id)}
                    className="w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className="shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-fp-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-fp-text">{statute.title}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-fp-amber/15 text-fp-amber">
                          <Clock className="w-2.5 h-2.5" />
                          {statute.deadline_value} {statute.deadline_type === "business_days" ? "business" : "calendar"} {statute.deadline_value === 1 ? "day" : "days"}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-fp-surface-2 text-fp-text-muted">
                          {STATUTE_CATEGORY_LABELS[statute.category]}
                        </span>
                      </div>
                      <div className="text-xs text-fp-text-dim mt-0.5 font-mono">{statute.ref}</div>
                    </div>
                    <div className="shrink-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-fp-text-dim" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-fp-text-dim" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      <p className="text-sm text-fp-text-muted leading-relaxed">{statute.description}</p>
                      <div className="flex items-center gap-4 text-[11px] text-fp-text-dim">
                        <span><span className="text-fp-text-muted">Direction:</span> {statute.deadline_direction === "max" ? "Maximum (must be within)" : "Minimum (must be at least"}</span>
                        <span><span className="text-fp-text-muted">Source:</span> {statute.source}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-fp-border bg-fp-surface/20 p-3 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-fp-text-dim shrink-0 mt-0.5" />
        <p className="text-[11px] text-fp-text-dim leading-relaxed">
          This library is for informational purposes only and does not constitute legal advice.
          Always consult a qualified attorney and verify current law before relying on any reference.
          Statutes and case law may have been amended or overturned.
        </p>
      </div>
    </div>
  );
}
