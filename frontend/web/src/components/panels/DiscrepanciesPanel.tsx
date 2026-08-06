"use client";

import { useEffect, useState } from "react";
import {
  Scale, AlertTriangle, ShieldCheck, Loader2,
  AlertCircle, RefreshCw, Play, CheckCircle, XCircle,
  BookOpen, FileSearch, Gavel, ChevronDown,
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
  return <ShieldCheck className="w-4 h-4 text-fp-green" />;
}

function severityBorder(severity: string) {
  if (severity === "critical") return "border-l-fp-red";
  if (severity === "warning") return "border-l-fp-amber";
  return "border-l-fp-green";
}

function ruleIcon(rule: string) {
  if (rule.startsWith("statute_")) return <Gavel className="w-3.5 h-3.5 text-fp-blue" />;
  if (rule.startsWith("discrepancy_")) return <FileSearch className="w-3.5 h-3.5 text-fp-amber" />;
  return <BookOpen className="w-3.5 h-3.5 text-fp-text-dim" />;
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
    <div className={`rounded-[14px] border border-fp-border border-l-4 ${severityBorder(finding.severity)} bg-fp-surface/40 overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/20`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-6 text-left hover:bg-fp-surface-2/40 transition-colors"
      >
        {severityIcon(finding.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {ruleIcon(finding.rule)}
            <span className="text-sm font-medium text-fp-text">{ruleLabel(finding)}</span>
          </div>
          <div className="text-xs text-fp-text-dim uppercase tracking-wide mt-1">
            {finding.severity} · {finding.status} · {finding.created_at?.slice(0, 10)}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-fp-text-dim transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-6 pb-6 pt-2 border-t border-fp-border/30">
          {finding.detail && (
            <p className="text-sm text-fp-text-muted leading-relaxed mt-2">{finding.detail}</p>
          )}
          {finding.evidence_id && (
            <div className="mt-4 text-xs text-fp-text-dim">
              Linked evidence: <span className="font-mono">{finding.evidence_id}</span>
            </div>
          )}
          {finding.status === "open" && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => onResolve(finding.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-green/15 text-fp-green text-xs font-medium hover:bg-fp-green/25 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Mark Resolved
              </button>
              <button
                onClick={() => onDismiss(finding.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-surface-2 text-fp-text-dim text-xs font-medium hover:text-fp-text transition-colors"
              >
                <XCircle className="w-4 h-4" /> Dismiss
              </button>
            </div>
          )}
          {(finding.status === "resolved" || finding.status === "dismissed") && (
            <button
              onClick={() => onReopen(finding.id)}
              className="mt-4 text-xs text-fp-text-dim hover:text-fp-text transition-colors"
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

  const statuteFindings = findings.filter(f => f.rule.startsWith("statute_"));
  const discrepancyFindings = findings.filter(f => f.rule.startsWith("discrepancy_"));
  const legacyFindings = findings.filter(f => !f.rule.startsWith("statute_") && !f.rule.startsWith("discrepancy_"));

  const filteredFindings = filter === "statute" ? statuteFindings
    : filter === "discrepancy" ? discrepancyFindings
    : filter === "legacy" ? legacyFindings
    : findings;

  const missingInfoFindings = findings.filter(f => f.status === "open" && f.detail?.toLowerCase().includes("missing"));

  function scoreColor(s: number | null) {
    if (s === null) return "text-fp-text-dim";
    if (s >= 80) return "text-fp-green";
    if (s >= 60) return "text-fp-amber";
    return "text-fp-red";
  }

  function scoreLabel(s: number | null) {
    if (s === null) return "Not assessed";
    if (s >= 80) return "Strong due process compliance";
    if (s >= 60) return "Moderate concerns identified";
    return "Critical due process risks";
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl">
      {/* Page Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Due Process Analysis</h1>
            <p className="text-sm text-fp-text-muted mt-1">
              Multi-agent statute matching, discrepancy detection &amp; procedural analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running Agents…</>
              ) : (
                <><Play className="w-4 h-4" /> Run All Agents</>
              )}
            </button>
          </div>
        </div>
        <div className="border-t border-fp-border mt-6" />
      </div>

      {/* ── Section 1: Overall Score (Hero) ── */}
      <section>
        <h2 className="text-base font-semibold text-fp-text mb-4">Overall Score</h2>
        <div className="rounded-[14px] glass p-8 flex items-center gap-8">
          <div className="flex flex-col items-center justify-center shrink-0">
            {score !== null ? (
              <div className={`text-6xl font-bold tabular-nums ${scoreColor(score)}`}>
                {score}
              </div>
            ) : (
              <div className="text-6xl font-bold tabular-nums text-fp-text-dim">—</div>
            )}
            <div className="text-xs text-fp-text-dim uppercase tracking-wide mt-2">out of 100</div>
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-sm text-fp-text">{scoreLabel(score)}</p>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-red/10 border border-fp-red/20">
                <AlertTriangle className="w-4 h-4 text-fp-red" />
                <span className="text-sm font-medium text-fp-red">{critical.length}</span>
                <span className="text-xs text-fp-text-dim">Critical</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-amber/10 border border-fp-amber/20">
                <AlertTriangle className="w-4 h-4 text-fp-amber" />
                <span className="text-sm font-medium text-fp-amber">{warnings.length}</span>
                <span className="text-xs text-fp-text-dim">Warnings</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-green/10 border border-fp-green/20">
                <CheckCircle className="w-4 h-4 text-fp-green" />
                <span className="text-sm font-medium text-fp-green">{resolved.length}</span>
                <span className="text-xs text-fp-text-dim">Resolved</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border">
                <BookOpen className="w-4 h-4 text-fp-text-dim" />
                <span className="text-sm font-medium text-fp-text">{findings.length}</span>
                <span className="text-xs text-fp-text-dim">Total Findings</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Agent Analysis Results ── */}
      {analysisResult && !analyzing && (
        <section>
          <h2 className="text-base font-semibold text-fp-text mb-4">AI Agent Results</h2>
          <div className="rounded-[14px] border border-fp-blue/20 bg-fp-blue/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-4 h-4 text-fp-blue" />
              <span className="text-sm font-medium text-fp-text">Analysis Agents Complete</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {analysisResult.results?.map((r: any, i: number) => (
                <div key={i} className="rounded-lg bg-fp-surface/40 border border-fp-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {r.status === "success" ? <CheckCircle className="w-4 h-4 text-fp-green" /> : <AlertCircle className="w-4 h-4 text-fp-amber" />}
                    <span className="text-xs font-medium text-fp-text capitalize">{r.agent.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-xs text-fp-text-dim line-clamp-2">{r.message}</div>
                </div>
              ))}
            </div>
            {analysisResult.guardrail && (
              <div className="text-xs text-fp-text-dim mt-4 italic border-t border-fp-border/30 pt-4">
                {analysisResult.guardrail}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section 3: Procedural Checks ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-fp-text">Procedural Checks</h2>
          <div className="flex items-center gap-2">
            {([
              { id: "all", label: "All" },
              { id: "statute", label: "Statute" },
              { id: "discrepancy", label: "Discrepancy" },
              { id: "legacy", label: "Other" },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.id
                    ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30"
                    : "text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-fp-red/30 bg-fp-red/5 p-4 mb-4 text-sm text-fp-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-fp-border bg-fp-surface/20 p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
            <h3 className="text-sm font-medium text-fp-text">No findings in this category</h3>
            <p className="text-xs text-fp-text-dim mt-2 max-w-sm mx-auto">
              Run the analysis agents to detect procedural discrepancies and statute matching issues.
            </p>
            <button
              onClick={runAnalysis}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
            >
              <Play className="w-4 h-4" /> Run All Agents
            </button>
          </div>
        ) : (
          <div className="space-y-4">
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
      </section>

      {/* ── Section 4: Missing Information ── */}
      {missingInfoFindings.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-fp-text mb-4">Missing Information</h2>
          <div className="space-y-4">
            {missingInfoFindings.map((f) => (
              <div key={f.id} className="rounded-[14px] border border-fp-border border-l-4 border-l-fp-amber bg-fp-surface/40 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="w-4 h-4 text-fp-amber" />
                  <span className="text-sm font-medium text-fp-text">{ruleLabel(f)}</span>
                </div>
                {f.detail && <p className="text-sm text-fp-text-muted">{f.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
