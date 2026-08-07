"use client";

import { useState, useCallback } from "react";
import {
  Gavel,
  Shield,
  FileText,
  AlertTriangle,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  Link2,
} from "lucide-react";

interface DefenseArgument {
  id: string;
  title: string;
  category: "procedural" | "substantive" | "evidentiary";
  status: "draft" | "strengthening" | "ready";
  findings: string[];
  description: string;
}

export default function DefenseBuilderPanel({ projectId }: { projectId: string }) {
  const [arguments_, setArguments] = useState<DefenseArgument[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/defense-arguments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({ error: "" }))) as { error?: string };
        throw new Error(errData.error || `Failed to generate (${res.status})`);
      }

      const data = (await res.json()) as { arguments?: DefenseArgument[] };
      const generated: DefenseArgument[] = data.arguments ?? [];

      if (generated.length === 0) {
        setError("No defense arguments could be generated. Run Legal Analysis first to detect due-process findings, or add more timeline events.");
      }

      setArguments(generated);
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate defense arguments");
    } finally {
      setGenerating(false);
    }
  }, [projectId]);

  const categoryColor: Record<DefenseArgument["category"], string> = {
    procedural: "text-fp-blue bg-fp-blue/10 border-fp-blue/30",
    substantive: "text-fp-amber bg-fp-amber/10 border-fp-amber/30",
    evidentiary: "text-fp-green bg-fp-green/10 border-fp-green/30",
  };

  const statusLabel: Record<DefenseArgument["status"], string> = {
    draft: "Draft",
    strengthening: "Strengthening…",
    ready: "Ready",
  };

  const statusColor: Record<DefenseArgument["status"], string> = {
    draft: "text-fp-text-dim",
    strengthening: "text-fp-amber",
    ready: "text-fp-green",
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fp-text flex items-center gap-2">
              <Gavel className="w-5 h-5 text-fp-blue" />
              Defense Builder
            </h2>
            <p className="text-sm text-fp-text-muted mt-1">
              Auto-generates defense arguments from due-process findings, timeline gaps, and evidence analysis.
              Each argument is linked to specific findings for traceability.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasGenerated && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted text-sm font-medium hover:bg-fp-surface transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Auto-Build Arguments
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass rounded-[14px] p-4 border-fp-amber/30 bg-fp-amber/10 flex items-start gap-3 text-fp-amber text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Defense Strategy Framework — always visible */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-fp-blue" />
            <h3 className="text-sm font-semibold text-fp-text">Procedural Defenses</h3>
          </div>
          <p className="text-xs text-fp-text-dim mb-3">
            Notice defects, missed deadlines, jurisdiction errors, failure to follow required procedures.
          </p>
          <div className="text-2xl font-semibold text-fp-blue">
            {arguments_.filter((a) => a.category === "procedural").length}
          </div>
        </div>

        <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-fp-amber" />
            <h3 className="text-sm font-semibold text-fp-text">Substantive Defenses</h3>
          </div>
          <p className="text-xs text-fp-text-dim mb-3">
            Misinterpretation of code, overreach, improper classification, factual disputes.
          </p>
          <div className="text-2xl font-semibold text-fp-amber">
            {arguments_.filter((a) => a.category === "substantive").length}
          </div>
        </div>

        <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-fp-green" />
            <h3 className="text-sm font-semibold text-fp-text">Evidentiary Defenses</h3>
          </div>
          <p className="text-xs text-fp-text-dim mb-3">
            Missing documentation, unreliable evidence, chain of custody, contradictory records.
          </p>
          <div className="text-2xl font-semibold text-fp-green">
            {arguments_.filter((a) => a.category === "evidentiary").length}
          </div>
        </div>
      </div>

      {/* Arguments List */}
      {arguments_.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-fp-text">Defense Arguments</h3>

          {arguments_.map((arg) => (
            <div
              key={arg.id}
              className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-semibold text-fp-text">{arg.title}</h4>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${categoryColor[arg.category]}`}>
                      {arg.category}
                    </span>
                  </div>
                  <p className="text-xs text-fp-text-muted leading-relaxed">{arg.description}</p>
                  {arg.findings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {arg.findings.map((f, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-md bg-fp-surface-2 text-fp-text-dim border border-fp-border/40 flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" />
                          Finding: {f.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium ${statusColor[arg.status]}`}>{statusLabel[arg.status]}</span>
                  <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-blue group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State — before generation */}
      {arguments_.length === 0 && !generating && !error && (
        <div className="glass rounded-[14px] p-12 text-center">
          <Gavel className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
          <h4 className="text-base font-semibold text-fp-text">No defense arguments yet</h4>
          <p className="text-sm text-fp-text-muted mt-1 mb-4 max-w-md mx-auto">
            Click "Auto-Build Arguments" to scan your due-process findings, timeline gaps, and evidence analysis.
            The system will generate draft defense arguments linked to specific findings — ready for review and export.
          </p>
          <button
            onClick={handleGenerate}
            className="px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Auto-Build from Findings
          </button>
        </div>
      )}

      {/* Generating State */}
      {generating && (
        <div className="glass rounded-[14px] p-12 text-center">
          <Loader2 className="w-8 h-8 text-fp-blue mx-auto mb-4 animate-spin" />
          <h4 className="text-sm font-semibold text-fp-text">Analyzing findings and timeline…</h4>
          <p className="text-xs text-fp-text-muted mt-1">
            Scanning due-process findings, detecting timeline gaps, and categorizing defense strategies.
          </p>
        </div>
      )}
    </div>
  );
}
