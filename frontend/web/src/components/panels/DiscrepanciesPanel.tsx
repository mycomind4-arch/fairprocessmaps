"use client";

import { useEffect, useState } from "react";
import {
  Scale, AlertTriangle, ShieldCheck, Loader2,
  AlertCircle, RefreshCw, ChevronDown, Play, CheckCircle, XCircle,
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
  if (severity === "critical") return "border-l-fp-red";
  if (severity === "warning") return "border-l-fp-amber";
  return "border-l-fp-cyan";
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

function FindingCard({ finding, onResolve, onDismiss, onReopen }: {
  finding: Finding;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className={`rounded-xl border border-fp-border border-l-4 ${severityBorder(finding.severity)} bg-fp-surface/40 overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-fp-surface-2/40 transition-colors"
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
        <ChevronDown
          className={`w-4 h-4 text-fp-text-dim transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-fp-border/30">
          {finding.detail && (
            <p className="text-sm text-fp-text-muted leading-relaxed mt-2">{finding.detail}</p>
          )}
          {finding.evidence_id && (
            <div className="mt-3 text-[11px] text-fp-text-dim">
              Linked evidence: {finding.evidence_id}
            </div>
          )}
          {finding.status === "open" && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => onResolve(finding.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-green/15 text-fp-green text-xs font-medium hover:bg-fp-green/25 transition-colors"
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
  const [filter, setFilter] = useState<"all" | "statute" | "discrepancy" | "legacy">("all");

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
      const result = await res.json();
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

  const statuteFindings = findings.filter(f => f.rule.startsWith("statute_"));
  const discrepancyFindings = findings.filter(f => f.rule.startsWith("discrepancy_"));
  const legacyFindings = findings.filter(f => !f.rule.startsWith("statute_") && !f.rule.startsWith("discrepancy_"));

  const filteredFindings = filter === "statute" ? statuteFindings
    : filter === "discrepancy" ? discrepancyFindings
    : filter === "legacy" ? legacyFindings
    : findings;

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
            Multi-agent statute matching, discrepancy detection &amp; procedural analysis
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Running Agents…</>
            ) : (
              <><Play className="w-4 h-4" /> Run All Agents</>
            )}
          </button>
        </div>
      </div>

      {/* Agent results banner */}
      {analysisResult && !analyzing && (
        <div className="rounded-xl border border-fp-cyan/20 bg-fp-cyan/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="w-4 h-4 text-fp-cyan" />
            <span className="text-sm font-medium text-fp-text">Analysis Agents Complete</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {analysisResult.results?.map((r: any, i: number) => (
              <div key={i} className="rounded-lg bg-fp-surface/40 border border-fp-border p-2.5">
                <div className="flex items-center gap-1.5">
                  {r.status === "success" ? <CheckCircle className="w-3 h-3 text-fp-green" /> : <AlertCircle className="w-3 h-3 text-fp-amber" />}
                  <span className="text-[11px] font-medium text-fp-text capitalize">{r.agent.replace(/_/g, " ")}</span>
                </div>
                <div className="text-[10px] text-fp-text-dim mt-1 line-clamp-2">{r.message}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-fp-text-dim mt-3 italic">
            {analysisResult.guardrail}
          </div>
        </div>
      )}

      {/* Summary tiles */}
      {!loading && findings.length > 0 && (
        <>
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

          {/* Filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { key: "all", label: "All", count: findings.length },
              { key: "statute", label: "Statute Matching", count: statuteFindings.length },
              { key: "discrepancy", label: "Discrepancies", count: discrepancyFindings.length },
              ...(legacyFindings.length > 0 ? [{ key: "legacy" as const, label: "Rule-Based", count: legacyFindings.length }] : []),
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-fp-cyan/15 text-fp-cyan"
                    : "text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2/40"
                }`}
              >
                {tab.label} <span className="opacity-60">({tab.count})</span>
              </button>
            ))}
          </div>
        </>
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
      {!loading && filteredFindings.length > 0 && (
        <div className="space-y-3">
          {filteredFindings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              onResolve={(id) => updateStatus(id, "resolved")}
              onDismiss={(id) => updateStatus(id, "dismissed")}
              onReopen={(id) => updateStatus(id, "open")}
            />
          ))}
        </div>
      )}

      {!loading && filteredFindings.length === 0 && !error && (
        <div className="text-center py-12">
          <Scale className="w-10 h-10 text-fp-text-dim mx-auto mb-3" />
          <p className="text-sm text-fp-text-dim">
            {findings.length === 0
              ? "No findings yet. Run the analysis agents to detect statute deviations and discrepancies."
              : `No ${filter === "all" ? "" : filter + " "}findings.`}
          </p>
        </div>
      )}
    </div>
  );
}
