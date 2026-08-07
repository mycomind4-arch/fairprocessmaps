"use client";

import { useState } from "react";
import {
  Gavel,
  Shield,
  FileText,
  AlertTriangle,
  Calendar,
  ChevronRight,
  Plus,
  Loader2,
} from "lucide-react";

interface DefenseArgument {
  id: string;
  title: string;
  category: "procedural" | "substantive" | "evidentiary";
  status: "draft" | "strengthening" | "ready";
  findings: string[];
  description: string;
}

const STARTER_ARGUMENTS: DefenseArgument[] = [
  {
    id: "1",
    title: "Insufficient Notice Period",
    category: "procedural",
    status: "draft",
    findings: [],
    description: "The agency failed to provide the statutorily required notice period before taking enforcement action.",
  },
];

export default function DefenseBuilderPanel({ projectId }: { projectId: string }) {
  const [arguments_, setArguments] = useState<DefenseArgument[]>(STARTER_ARGUMENTS);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Auto-build defense arguments from due process findings
      const res = await fetch(`/api/v1/cases/${projectId}/summary`);
      const summary = await res.json();

      // TODO: AI generates defense arguments from findings
      // For now, just simulate
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate defense arguments");
    } finally {
      setGenerating(false);
    }
  };

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
              AI-assisted construction of your defense argument. Pulls from findings, timeline gaps, and authority analysis.
            </p>
          </div>
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

      {/* Defense Strategy Framework */}
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
                <p className="text-xs text-fp-text-muted">{arg.description}</p>
                {arg.findings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {arg.findings.map((f, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded-md bg-fp-surface-2 text-fp-text-dim border border-fp-border/40"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-fp-text-dim">{statusLabel[arg.status]}</span>
                <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-blue group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </div>
        ))}

        {arguments_.length === 0 && (
          <div className="glass rounded-[14px] p-12 text-center">
            <Gavel className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
            <h4 className="text-base font-semibold text-fp-text">No defense arguments yet</h4>
            <p className="text-sm text-fp-text-muted mt-1 mb-4">
              Click "Auto-Build Arguments" to let AI scan findings and generate draft arguments, or create one manually.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Auto-Build from Findings
            </button>
          </div>
        )}
      </div>

      {/* AI Enhancement Coming Banner */}
      <div className="glass rounded-[14px] p-6 border-fp-blue/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-fp-blue" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-fp-text">AI Defense Builder — Coming Soon</h4>
            <p className="text-xs text-fp-text-muted mt-1">
              The system will automatically scan all due process findings, timeline gaps, and authority conflicts to generate draft defense arguments. Each argument will be linked to specific evidence, statutory references, and timeline discrepancies. You'll be able to export a complete defense brief.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
