"use client";

import { useEffect, useState } from "react";
import {
  Scale, AlertTriangle, ShieldCheck, Loader2,
  AlertCircle, RefreshCw, ChevronDown, Play, CheckCircle, XCircle,
} from "lucide-react";

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  created_at: string;
}

function severityIcon(severity: string) {
  if (severity === "critical") return <AlertTriangle className="w-4 h-4 text-fp-red" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-fp-amber" />;
  return <ShieldCheck className="w-4 h-4 text-fp-cyan" />;
}

function severityBorder(severity: string) {
  if (severity === "critical") return "border-l-fp-red";
  if (severity === "warning") return "border-l-fp-amber";
  return "border-l-fp-cyan";
}

function ruleLabel(finding: Finding) {
  if (finding.rule_name) return finding.rule_name;
  const labels: Record<string, string> = {
    notice_timing: "Adequate Notice Period",
    hearing_right: "Right to Hearing",
    appeal_pathway: "Appeal Pathway Available",
  };
  return labels[finding.rule] ?? finding.rule.replace(/_/g, " ");
}

export default function DiscrepanciesPanel({ projectId }: { projectId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/findings?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { items?: Finding[]; score?: number } = await res.json();
      setFindings(json.items ?? []);
      setScore(json.score ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/findings?projectId=${projectId}`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const result = await res.json() as { score?: number };
      setScore(result.score ?? null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/v1/findings?id=${id}&projectId=${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch {
      setError("Failed to update finding");
    }
  };

  const critical = findings.filter((f) => f.severity === "critical" && f.status === "open");
  const warnings = findings.filter((f) => f.severity === "warning" && f.status === "open");
  const resolved = findings.filter((f) => f.status === "resolved");

  function scoreColor(s: number | null) {
    if (s === null) return "text-fp-text-dim";
    if (s >= 80) return "text-fp-green";
    if (s >= 60) return "text-fp-amber";
    if (s >= 40) return "text-fp-orange";
    return "text-fp-red";
  }

  return (
    <div className="space-y-5 pb-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fp-text">Due Process Analysis</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">
            Procedural violations detected from timeline events and evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {score !== null && (
            <div className="px-3 py-1.5 rounded-lg bg-fp-surface/60 border border-fp-border text-sm">
              Score: <span className={`font-semibold ${scoreColor(score)}`}>{score}</span>
            </div>
          )}
          <button
            onClick={fetchData}
            className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fp-cyan text-white text-sm font-medium hover:bg-fp-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            ) : (
              <><Play className="w-4 h-4" /> Run Analysis</>
            )}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {!loading && findings.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-fp-red/20 bg-fp-red/5 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-fp-red" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Critical</div>
            </div>
            <div className="text-2xl font-semibold text-fp-red mt-1">{critical.length}</div>
          </div>
          <div className="rounded-lg border border-fp-border bg-fp-surface/40 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-fp-amber" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Warnings</div>
            </div>
            <div className="text-2xl font-semibold text-fp-text mt-1">{warnings.length}</div>
          </div>
          <div className="rounded-lg border border-fp-border bg-fp-surface/40 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-fp-cyan" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Resolved</div>
            </div>
            <div className="text-2xl font-semibold text-fp-text mt-1">{resolved.length}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading findings…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Findings list */}
      {!loading && findings.length > 0 && (
        <div className="space-y-3">
          {findings.map((f) => (
            <div
              key={f.id}
              className={`rounded-xl border border-fp-border border-l-4 ${severityBorder(f.severity)} bg-fp-surface/40 overflow-hidden`}
            >
              <button
                onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-fp-surface-2/40 transition-colors"
              >
                {severityIcon(f.severity)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-text">{ruleLabel(f)}</div>
                  <div className="text-[11px] text-fp-text-dim capitalize">
                    {f.severity} · {f.status} · {f.created_at?.slice(0, 10)}
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-fp-text-dim transition-transform ${expanded === f.id ? "rotate-180" : ""}`}
                />
              </button>
              {expanded === f.id && (
                <div className="px-4 pb-4 pt-1 border-t border-fp-border/30">
                  {f.detail && (
                    <p className="text-sm text-fp-text-muted leading-relaxed mt-2">{f.detail}</p>
                  )}
                  {f.evidence_id && (
                    <div className="mt-3 text-[11px] text-fp-text-dim">
                      Linked evidence: {f.evidence_id}
                    </div>
                  )}
                  {f.status === "open" && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => updateStatus(f.id, "resolved")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-green/15 text-fp-green text-xs font-medium hover:bg-fp-green/25 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                      </button>
                      <button
                        onClick={() => updateStatus(f.id, "dismissed")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 text-fp-text-dim text-xs font-medium hover:text-fp-text transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Dismiss
                      </button>
                    </div>
                  )}
                  {(f.status === "resolved" || f.status === "dismissed") && (
                    <button
                      onClick={() => updateStatus(f.id, "open")}
                      className="mt-3 text-xs text-fp-text-dim hover:text-fp-text transition-colors"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && findings.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-12 text-center">
          <Scale className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No discrepancies detected</h3>
          <p className="text-xs text-fp-text-dim mt-1 mb-4 max-w-sm mx-auto">
            Add timeline events (notices, hearings, decisions) and run the analyzer to detect
            procedural violations, missing notice periods, and other due process issues.
          </p>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-cyan text-white text-sm font-medium hover:bg-fp-cyan/90 disabled:opacity-50 transition-colors"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {analyzing ? "Analyzing…" : "Run Analysis"}
          </button>
        </div>
      )}
    </div>
  );
}
