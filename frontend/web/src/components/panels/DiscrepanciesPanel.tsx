"use client";

import { useEffect, useState } from "react";
import {
  Scale, AlertTriangle, ShieldCheck, Loader2,
  AlertCircle, RefreshCw, Play, CheckCircle, XCircle,
  BookOpen, FileSearch, Gavel,
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
  if (severity === "critical") return "fp-accent-left-red";
  if (severity === "warning") return "fp-accent-left-amber";
  return "fp-accent-left-cyan";
}

function ruleIcon(rule: string) {
  if (rule.startsWith("statute_")) return <Gavel className="w-3 h-3 text-fp-purple" />;
  if (rule.startsWith("discrepancy_")) return <FileSearch className="w-3 h-3 text-fp-cyan" />;
  return <BookOpen className="w-3 h-3 text-fp-text-dim" />;
}

function ruleLabel(finding: Finding) {
  if (finding.rule_name) return finding.rule_name;
  const labels: Record<string, string> = {
    notice_timing: "Adequate Notice Period",
    hearing_right: "Right to Hearing",
    appeal_pathway: "Appeal Pathway Available",
    abatement_without_notice: "Abatement Without Notice",
    permit_review_right: "Permit Review Rights",
    ce_outcome_review: "CE Outcome Review",
  };
  return labels[finding.rule] ?? finding.rule.replace(/_/g, " ");
}

function FindingRow({ finding, onResolve, onDismiss, onReopen }: {
  finding: Finding;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`fp-card ${severityBorder(finding.severity)} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-fp-surface-2/30 transition-colors"
      >
        {severityIcon(finding.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {ruleIcon(finding.rule)}
            <span className="text-sm font-medium text-fp-text">{ruleLabel(finding)}</span>
          </div>
          <div className="text-[11px] text-fp-text-dim capitalize mt-0.5">
            {finding.severity} · {finding.status} · {finding.created_at?.slice(0, 10)}
          </div>
        </div>
        {finding.status === "open" ? (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-fp-amber/15 text-fp-amber shrink-0">
            Open
          </span>
        ) : (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-fp-green/15 text-fp-green shrink-0">
            {finding.status}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-fp-border-subtle">
          {finding.detail && (
            <p className="text-sm text-fp-text-muted leading-relaxed mt-3">{finding.detail}</p>
          )}
          {finding.evidence_id && (
            <div className="mt-3 text-[11px] text-fp-text-dim">
              Linked evidence: {finding.evidence_id}
            </div>
          )}
          {finding.status === "open" && (
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => onResolve(finding.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-green/10 text-fp-green text-xs font-medium hover:bg-fp-green/20 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
              </button>
              <button
                onClick={() => onDismiss(finding.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 text-fp-text-dim text-xs font-medium hover:text-fp-text transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Dismiss
              </button>
            </div>
          )}
          {(finding.status === "resolved" || finding.status === "dismissed") && (
            <button
              onClick={() => onReopen(finding.id)}
              className="mt-3 text-xs text-fp-text-dim hover:text-fp-text transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiscrepanciesPanel({ projectId }: { projectId: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const result: { results?: Array<{ status: string; agent: string; message: string }>; guardrail?: string; score?: number } = await res.json();
      setAnalysisResult(result);
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
  const missingInfo = findings.filter((f) => f.rule.startsWith("discrepancy_") && f.status === "open");
  const statuteFindings = findings.filter(f => f.rule.startsWith("statute_"));
  const proceduralChecks = findings.filter(f => !f.rule.startsWith("statute_") && !f.rule.startsWith("discrepancy_"));

  function scoreColor(s: number | null) {
    if (s === null) return "text-fp-text-dim";
    if (s >= 80) return "text-fp-green";
    if (s >= 60) return "text-fp-amber";
    if (s >= 40) return "text-fp-orange";
    return "text-fp-red";
  }

  return (
    <div className="space-y-8 pb-12 max-w-4xl">
      {/* ── Page Header ── */}
      <div className="fp-page-header flex items-start justify-between">
        <div>
          <h2 className="fp-page-title">Due Process Analysis</h2>
          <p className="fp-page-subtitle">
            Multi-agent statute matching, discrepancy detection &amp; procedural analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-lg fp-card fp-card-lift text-fp-text-muted hover:text-fp-text"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-cyan text-white text-sm font-medium hover:bg-fp-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> Run All Agents</>
            )}
          </button>
        </div>
      </div>

      {/* ── Overall Score ── */}
      <div className="fp-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="fp-section-title">Overall Score</h3>
            <div className="text-[11px] text-fp-text-dim mt-1">Composite due-process compliance rating</div>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${scoreColor(score)}`}>{score ?? "—"}</div>
            <div className="text-[11px] text-fp-text-dim mt-1">
              {score !== null && score >= 80 ? "Strong compliance" : score !== null && score >= 60 ? "Moderate compliance" : score !== null ? "Significant gaps" : "Not scored"}
            </div>
          </div>
        </div>
        {analysisResult && !analyzing && (
          <div className="mt-6 pt-6 border-t border-fp-border-subtle">
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-3.5 h-3.5 text-fp-cyan" />
              <span className="text-xs font-medium text-fp-text">Agent Results</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {analysisResult.results?.map((r: any, i: number) => (
                <div key={i} className="rounded-lg bg-fp-surface/40 border border-fp-border p-3">
                  <div className="flex items-center gap-1.5">
                    {r.status === "success" ? <CheckCircle className="w-3 h-3 text-fp-green" /> : <AlertCircle className="w-3 h-3 text-fp-amber" />}
                    <span className="text-[11px] font-medium text-fp-text capitalize">{r.agent.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-[10px] text-fp-text-dim mt-1 line-clamp-2">{r.message}</div>
                </div>
              ))}
            </div>
            {analysisResult.guardrail && (
              <div className="text-[10px] text-fp-text-dim mt-3 italic">{analysisResult.guardrail}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Observations ── */}
      {!loading && findings.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="fp-card p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-fp-red" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Critical</div>
            </div>
            <div className="text-3xl font-semibold text-fp-red mt-2">{critical.length}</div>
            <div className="text-[11px] text-fp-text-dim mt-1">Open critical findings</div>
          </div>
          <div className="fp-card p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-fp-amber" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Warnings</div>
            </div>
            <div className="text-3xl font-semibold text-fp-text mt-2">{warnings.length}</div>
            <div className="text-[11px] text-fp-text-dim mt-1">Open warnings</div>
          </div>
          <div className="fp-card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-fp-cyan" />
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Resolved</div>
            </div>
            <div className="text-3xl font-semibold text-fp-text mt-2">{resolved.length}</div>
            <div className="text-[11px] text-fp-text-dim mt-1">Findings resolved</div>
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

      {/* ── Procedural Checks (Statute Matching) ── */}
      {!loading && statuteFindings.length > 0 && (
        <div>
          <h3 className="fp-section-title mb-4">Procedural Checks</h3>
          <p className="text-xs text-fp-text-dim mb-4">Statute-matched findings from California code enforcement law</p>
          <div className="space-y-3">
            {statuteFindings.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                onResolve={(id) => updateStatus(id, "resolved")}
                onDismiss={(id) => updateStatus(id, "dismissed")}
                onReopen={(id) => updateStatus(id, "open")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Missing Information (Discrepancies) ── */}
      {!loading && missingInfo.length > 0 && (
        <div>
          <h3 className="fp-section-title mb-4">Missing Information</h3>
          <p className="text-xs text-fp-text-dim mb-4">Discrepancy detection — required data or procedures not found</p>
          <div className="space-y-3">
            {missingInfo.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                onResolve={(id) => updateStatus(id, "resolved")}
                onDismiss={(id) => updateStatus(id, "dismissed")}
                onReopen={(id) => updateStatus(id, "open")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Legacy Rule-Based Findings ── */}
      {!loading && proceduralChecks.length > 0 && (
        <div>
          <h3 className="fp-section-title mb-4">Rule-Based Findings</h3>
          <div className="space-y-3">
            {proceduralChecks.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                onResolve={(id) => updateStatus(id, "resolved")}
                onDismiss={(id) => updateStatus(id, "dismissed")}
                onReopen={(id) => updateStatus(id, "open")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && findings.length === 0 && !error && (
        <div className="fp-card p-12 text-center" style={{ borderStyle: "dashed" }}>
          <Scale className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No analysis has been run yet.</h3>
          <p className="text-xs text-fp-text-dim mt-1.5 mb-6 max-w-sm mx-auto">
            Run the analysis agents to detect statute deviations, procedural discrepancies, and due process issues.
          </p>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-cyan text-white text-sm font-medium hover:bg-fp-cyan/90 disabled:opacity-50 transition-colors"
          >
            <Play className="w-4 h-4" /> Run Analysis
          </button>
        </div>
      )}
    </div>
  );
}
