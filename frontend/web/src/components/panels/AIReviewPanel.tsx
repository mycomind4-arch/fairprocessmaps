"use client";

import { useEffect, useState } from "react";
import {
  Bot, Loader2, AlertCircle, RefreshCw,
  FileText, AlertTriangle, Clock, Search, GitBranch,
  CheckCircle2, XCircle, ArrowRight, Eye,
} from "lucide-react";

interface Proposal {
  id: string;
  type: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "needs_info";
  evidence_id?: string;
  evidence_title?: string;
  created_at: string;
  confidence?: number;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  missing_info?: number | boolean;
  created_at: string;
}

interface AIReviewData {
  proposals: Proposal[];
  findings: Finding[];
  recentRuns: { id: string; agent: string; status: string; created_at: string; message: string }[];
}

export default function AIReviewPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<AIReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [findingsRes, proposalsRes] = await Promise.all([
        fetch(`/api/v1/findings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/cases/${projectId}/agents/proposals`, { headers: { "Cache-Control": "no-cache" } }),
      ]);

      const findings: Finding[] = findingsRes.ok ? await findingsRes.json() : [];
      const proposalsData: any = proposalsRes.ok ? await proposalsRes.json() : { proposals: [] };
      const proposals: Proposal[] = proposalsData?.proposals ?? [];

      setData({ proposals, findings, recentRuns: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI review data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
        Loading AI review…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface-flat rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error ?? "No AI review data available"}</span>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const missingInfoFindings = data.findings.filter(f => f.missing_info && f.status === "open");
  const openFindings = data.findings.filter(f => f.status === "open");
  const pendingProposals = data.proposals.filter(p => p.status === "pending");

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="AI Review">
      {/* Header */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fp-text flex items-center gap-2">
              <Bot className="w-5 h-5 text-fp-blue" />
              AI Review
            </h1>
            <p className="text-xs text-fp-text-dim mt-0.5">
              System-identified items pending human review. Every item links to supporting evidence.
            </p>
          </div>
          <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-flat rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Open Findings</div>
          <div className="text-lg font-semibold text-fp-text mt-1">{openFindings.length}</div>
        </div>
        <div className="surface-flat rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Missing Evidence</div>
          <div className="text-lg font-semibold text-fp-amber mt-1">{missingInfoFindings.length}</div>
        </div>
        <div className="surface-flat rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Pending Proposals</div>
          <div className="text-lg font-semibold text-fp-blue mt-1">{pendingProposals.length}</div>
        </div>
      </div>

      {/* AI Observations — findings with missing_info */}
      {missingInfoFindings.length > 0 && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-fp-amber" />
            Missing Evidence Identified
          </h2>
          <div className="space-y-2">
            {missingInfoFindings.map((f) => (
              <div key={f.id} className="p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60 hover:border-fp-border transition-colors">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-fp-amber shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fp-text">{f.rule_name || f.rule}</div>
                    {f.detail && <div className="text-xs text-fp-text-muted mt-1">{f.detail}</div>}
                    {f.evidence_id && (
                      <a href={`/api/v1/evidence/${f.evidence_id}`} className="text-xs text-fp-blue hover:underline mt-1.5 inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> View evidence
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions & anomalies — critical findings */}
      {openFindings.filter(f => f.severity === "critical").length > 0 && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-fp-red" />
            Contradictions & Anomalies
          </h2>
          <div className="space-y-2">
            {openFindings.filter(f => f.severity === "critical").map((f) => (
              <div key={f.id} className="p-3 rounded-lg bg-fp-red/5 border border-fp-red/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-fp-red shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fp-text">{f.rule_name || f.rule}</div>
                    {f.detail && <div className="text-xs text-fp-text-muted mt-1">{f.detail}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statute matches — findings with statute rules */}
      {openFindings.filter(f => f.rule.startsWith("statute_")).length > 0 && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-fp-blue" />
            Statute Matches
          </h2>
          <div className="space-y-2">
            {openFindings.filter(f => f.rule.startsWith("statute_")).map((f) => (
              <div key={f.id} className="p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
                <div className="flex items-start gap-3">
                  <GitBranch className="w-4 h-4 text-fp-blue shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fp-text">{f.rule_name || f.rule}</div>
                    {f.detail && <div className="text-xs text-fp-text-muted mt-1">{f.detail}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent proposals */}
      {pendingProposals.length > 0 && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-fp-blue" />
            Pending Proposals
          </h2>
          <div className="space-y-2">
            {pendingProposals.map((p) => (
              <div key={p.id} className="p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
                <div className="flex items-start gap-3">
                  <Bot className="w-4 h-4 text-fp-blue shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fp-text">{p.title}</div>
                    {p.description && <div className="text-xs text-fp-text-muted mt-1">{p.description}</div>}
                    {p.evidence_id && (
                      <a href={`/api/v1/evidence/${p.evidence_id}`} className="text-xs text-fp-blue hover:underline mt-1.5 inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> View evidence
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="p-1.5 rounded-lg bg-fp-green/10 text-fp-green hover:bg-fp-green/20 transition-colors" title="Approve">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-lg bg-fp-red/10 text-fp-red hover:bg-fp-red/20 transition-colors" title="Reject">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded-lg bg-fp-blue/10 text-fp-blue hover:bg-fp-blue/20 transition-colors" title="Review">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {openFindings.length === 0 && pendingProposals.length === 0 && (
        <div className="surface-flat rounded-xl p-8 text-center">
          <Bot className="w-8 h-8 text-fp-text-dim mx-auto mb-2" />
          <p className="text-sm text-fp-text-muted">No items pending review</p>
          <p className="text-xs text-fp-text-dim mt-1">Run analysis to generate AI observations</p>
        </div>
      )}
    </div>
  );
}
