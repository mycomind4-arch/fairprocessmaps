"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Loader2, Download, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";

type BriefType = "motion_to_dismiss" | "appeal_letter" | "complaint" | "case_summary";

interface BriefMeta {
  label: string;
  description: string;
  price: string;
}

const BRIEF_TYPES: Record<BriefType, BriefMeta> = {
  motion_to_dismiss: {
    label: "Motion to Dismiss",
    description: "Challenge enforcement action for due-process violations",
    price: "$99",
  },
  appeal_letter: {
    label: "Appeal Letter",
    description: "Appeal a zoning, planning, or permit decision",
    price: "$49",
  },
  complaint: {
    label: "Draft Complaint",
    description: "Complaint for damages from due-process violations",
    price: "$99",
  },
  case_summary: {
    label: "Case Summary",
    description: "Internal case summary with full analysis",
    price: "Free",
  },
};

interface GeneratedBrief {
  id: string;
  brief_type: BriefType;
  title: string;
  content?: string;
  word_count: number;
  finding_count: number;
  citation_count: number;
  generated_at: string;
}

export function BriefGeneratorPanel({ projectId }: { projectId: string }) {
  const [briefs, setBriefs] = useState<GeneratedBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<BriefType>("motion_to_dismiss");
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [defendantName, setDefendantName] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [courtName, setCourtName] = useState("");

  const loadBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/brief`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json() as any;
        setBriefs(data.briefs || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          brief_type: selectedType,
          defendant_name: defendantName || undefined,
          case_number: caseNumber || undefined,
          court_name: courtName || undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json() as any;
      setBriefs(prev => [data.brief, ...prev]);
      setExpandedBrief(data.brief.id);
      setBriefContent(data.brief.content);
    } catch (err: any) {
      setError(err.message || "Failed to generate brief");
    } finally {
      setGenerating(false);
    }
  };

  const handleExpand = async (briefId: string) => {
    if (expandedBrief === briefId) {
      setExpandedBrief(null);
      setBriefContent(null);
      return;
    }
    setExpandedBrief(briefId);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/brief?briefId=${briefId}`, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json() as any;
        setBriefContent(data.brief?.content || "");
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDownload = (brief: GeneratedBrief) => {
    if (!brief.content && !briefContent) return;
    const content = brief.content || briefContent || "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief.brief_type}_${projectId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-fp-blue/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-fp-blue" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-fp-text">Legal Brief Generator</h3>
          <p className="text-xs text-fp-text-dim">AI-powered draft briefs from case findings</p>
        </div>
      </div>

      {/* Brief type selector */}
      <div className="space-y-3">
        <p className="text-xs text-fp-text-dim uppercase tracking-wide">Select Brief Type</p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(BRIEF_TYPES) as [BriefType, BriefMeta][]).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`text-left rounded-xl border p-4 transition-all ${
                selectedType === type
                  ? "border-fp-blue bg-fp-blue/5"
                  : "border-fp-border bg-fp-surface hover:border-fp-blue/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-fp-text">{meta.label}</span>
                <span className={`text-xs font-bold ${meta.price === "Free" ? "text-fp-cyan" : "text-fp-blue"}`}>
                  {meta.price}
                </span>
              </div>
              <p className="text-xs text-fp-text-dim">{meta.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Optional fields */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-fp-text-dim mb-1">Defendant Name</label>
          <input
            type="text"
            placeholder="John Doe"
            value={defendantName}
            onChange={(e) => setDefendantName(e.target.value)}
            className="w-full rounded-xl bg-fp-surface border border-fp-border px-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-all"
          />
        </div>
        <div>
          <label className="block text-xs text-fp-text-dim mb-1">Case Number</label>
          <input
            type="text"
            placeholder="CV-2026-001"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            className="w-full rounded-xl bg-fp-surface border border-fp-border px-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-all"
          />
        </div>
        <div>
          <label className="block text-xs text-fp-text-dim mb-1">Court Name</label>
          <input
            type="text"
            placeholder="Humboldt County Superior Court"
            value={courtName}
            onChange={(e) => setCourtName(e.target.value)}
            className="w-full rounded-xl bg-fp-surface border border-fp-border px-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-fp-red p-3 rounded-xl bg-fp-red/10 border border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full rounded-xl bg-fp-blue text-white text-sm font-semibold py-3 hover:shadow-lg hover:shadow-fp-blue/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating brief…
          </>
        ) : (
          <>
            <FileText className="w-4 h-4" />
            Generate {BRIEF_TYPES[selectedType].label}
          </>
        )}
      </button>

      {/* Generated briefs list */}
      <div className="space-y-3">
        <p className="text-xs text-fp-text-dim uppercase tracking-wide">
          Generated Briefs {briefs.length > 0 && `(${briefs.length})`}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-fp-text-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : briefs.length === 0 ? (
          <div className="text-center py-8 text-fp-text-dim text-sm">
            No briefs generated yet. Select a type above and generate.
          </div>
        ) : (
          <div className="space-y-2">
            {briefs.map((brief) => (
              <div key={brief.id} className="rounded-xl border border-fp-border bg-fp-surface overflow-hidden">
                <button
                  onClick={() => handleExpand(brief.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-fp-surface/80 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {expandedBrief === brief.id ? (
                      <ChevronDown className="w-4 h-4 text-fp-text-dim" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-fp-text-dim" />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium text-fp-text">
                        {BRIEF_TYPES[brief.brief_type as BriefType]?.label || brief.brief_type}
                      </p>
                      <p className="text-xs text-fp-text-dim">
                        {brief.word_count} words · {brief.finding_count} findings · {brief.citation_count} citations · {new Date(brief.generated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(brief);
                    }}
                    className="text-fp-text-dim hover:text-fp-blue transition-all"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </button>

                {expandedBrief === brief.id && (
                  <div className="border-t border-fp-border p-4 max-h-96 overflow-y-auto">
                    {loadingContent ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
                      </div>
                    ) : (
                      <pre className="text-xs text-fp-text whitespace-pre-wrap font-mono leading-relaxed">
                        {brief.content || briefContent || "Loading…"}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-fp-text-dim text-center pt-2">
        Draft briefs must be reviewed by a licensed attorney before filing.
        All citations are verified but should be independently confirmed.
      </p>
    </div>
  );
}
