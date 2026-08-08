"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gavel,
  Shield,
  FileText,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
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
  missing_info?: number | boolean;
}

interface DefenseArgument {
  id: string;
  title: string;
  category: "procedural" | "substantive" | "evidentiary";
  status: "draft" | "strengthening" | "ready";
  findings: Finding[];
  description: string;
  statutoryRef?: string;
}

const RULE_TO_CATEGORY: Record<string, "procedural" | "substantive" | "evidentiary"> = {
  notice_timing: "procedural",
  hearing_right: "procedural",
  appeal_pathway: "procedural",
  abatement_without_notice: "procedural",
  ce_outcome_review: "procedural",
  right_to_hearing: "procedural",
  hearing_notice_adequacy: "procedural",
  lien_without_due_process: "procedural",
  appeal_rights: "procedural",
  permit_review_right: "procedural",
  work_without_permit: "substantive",
  expired_permit: "substantive",
  no_permit: "substantive",
  nuisance: "substantive",
  substandard: "substantive",
  permit_after_ce_notice: "evidentiary",
  lien_without_ce_case: "evidentiary",
  incomplete_records: "evidentiary",
};

function categorizeRule(rule: string): "procedural" | "substantive" | "evidentiary" {
  if (rule.startsWith("statute_")) return "procedural";
  if (rule.startsWith("discrepancy_")) return "evidentiary";
  return RULE_TO_CATEGORY[rule] ?? "procedural";
}

function ruleToDefenseTitle(finding: Finding): string {
  const rule = finding.rule;
  const map: Record<string, string> = {
    notice_timing: "Insufficient Notice Period",
    hearing_right: "Right to Hearing Denied",
    right_to_hearing: "Right to Hearing Denied",
    appeal_pathway: "Appeal Pathway Not Provided",
    abatement_without_notice: "Abatement Without Proper Notice",
    ce_outcome_review: "Case Closed Without Review Opportunity",
    hearing_notice_adequacy: "Insufficient Hearing Notice",
    lien_without_due_process: "Lien Filed Without Due Process",
    appeal_rights: "Appeal Rights Not Documented",
    permit_review_right: "Permit Review Rights Violated",
    work_without_permit: "Unpermitted Construction Allegation",
    expired_permit: "Expired Permit Without Review",
    no_permit: "No Permit on Record",
    permit_after_ce_notice: "Permit Timeline Discrepancy",
    lien_without_ce_case: "Recorded Lien Without Corresponding Case",
    incomplete_records: "Incomplete Agency Records",
    nuisance: "Nuisance Classification Dispute",
    substandard: "Substandard Housing Classification Dispute",
  };
  if (rule.startsWith("statute_")) {
    return `Statutory Deadline Violation: ${finding.rule_name || rule}`;
  }
  if (rule.startsWith("discrepancy_")) {
    return `Record Discrepancy: ${finding.rule_name || rule}`;
  }
  return map[rule] ?? rule.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ruleToDefenseDescription(finding: Finding): string {
  return finding.detail || "No detail available for this finding.";
}

function generateArguments(findings: Finding[]): DefenseArgument[] {
  const activeFindings = findings.filter(f => f.status === "open");
  const byCategory: Record<string, Finding[]> = {};
  for (const f of activeFindings) {
    const cat = categorizeRule(f.rule);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  const arguments_: DefenseArgument[] = [];
  for (const [category, catFindings] of Object.entries(byCategory)) {
    const byRule: Record<string, Finding[]> = {};
    for (const f of catFindings) {
      if (!byRule[f.rule]) byRule[f.rule] = [];
      byRule[f.rule].push(f);
    }

    for (const [rule, ruleFindings] of Object.entries(byRule)) {
      const firstFinding = ruleFindings[0];
      const hasEvidence = ruleFindings.some(f => f.evidence_id);
      const allMissing = ruleFindings.every(f => f.missing_info);

      arguments_.push({
        id: `${rule}_${arguments_.length}`,
        title: ruleToDefenseTitle(firstFinding),
        category: category as "procedural" | "substantive" | "evidentiary",
        status: hasEvidence ? "ready" : allMissing ? "draft" : "strengthening",
        findings: ruleFindings,
        description: ruleToDefenseDescription(firstFinding),
        statutoryRef: rule.startsWith("statute_") ? firstFinding.rule_name ?? undefined : undefined,
      });
    }
  }

  const catOrder = { procedural: 0, substantive: 1, evidentiary: 2 };
  arguments_.sort((a, b) => catOrder[a.category] - catOrder[b.category]);

  return arguments_;
}

export default function DefenseBuilderPanel({ projectId }: { projectId: string }) {
  const [arguments_, setArguments] = useState<DefenseArgument[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/findings?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed to load findings: ${res.status}`);
      const json = await res.json() as { items?: Finding[]; score?: number };
      const allFindings = json.items ?? [];
      setFindings(allFindings.filter((f: Finding) => f.status !== "superseded"));
      setArguments(generateArguments(allFindings));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await fetchData();
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

  const categoryIcon: Record<DefenseArgument["category"], typeof AlertTriangle> = {
    procedural: AlertTriangle,
    substantive: Shield,
    evidentiary: FileText,
  };

  const statusLabel: Record<DefenseArgument["status"], string> = {
    draft: "Draft — needs evidence",
    strengthening: "Strengthening — partial evidence",
    ready: "Ready — evidence linked",
  };

  const statusIcon: Record<DefenseArgument["status"], typeof CheckCircle2> = {
    draft: XCircle,
    strengthening: AlertCircle,
    ready: CheckCircle2,
  };

  const proceduralCount = arguments_.filter(a => a.category === "procedural").length;
  const substantiveCount = arguments_.filter(a => a.category === "substantive").length;
  const evidentiaryCount = arguments_.filter(a => a.category === "evidentiary").length;

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Defense Builder">
      {/* Header */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Gavel className="w-4 h-4 text-fp-blue" />
              Defense Builder
            </h2>
            <p className="text-xs text-fp-text-muted mt-0.5">
              Auto-generated defense arguments from {findings.filter(f => f.status === "open").length} active due process findings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text hover:bg-fp-surface transition-colors"
              title="Refresh findings"
              aria-label="Refresh findings"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3.5 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Auto-Build
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="surface-flat rounded-lg p-3 border-fp-red/30 bg-fp-red/10 flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Category summary */}
      {arguments_.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "Procedural", count: proceduralCount, color: "text-fp-blue" },
            { label: "Substantive", count: substantiveCount, color: "text-fp-amber" },
            { label: "Evidentiary", count: evidentiaryCount, color: "text-fp-green" },
          ].map((cat) => (
            <span key={cat.label} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
              cat.count > 0
                ? cat.color === "text-fp-blue" ? "bg-fp-blue/15 text-fp-blue border-fp-blue/30" : cat.color === "text-fp-amber" ? "bg-fp-amber/15 text-fp-amber border-fp-amber/30" : "bg-fp-green/15 text-fp-green border-fp-green/30"
                : "bg-fp-surface-2 text-fp-text-dim border-fp-border"
            }`}>
              {cat.count} {cat.label}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
          Loading defense arguments…
        </div>
      )}

      {/* Arguments list */}
      {!loading && arguments_.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl surface-flat flex items-center justify-center mb-3">
            <Gavel className="w-6 h-6 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">No defense arguments yet</p>
          <p className="text-xs text-fp-text-dim mt-1">Run analysis agents to generate arguments from findings.</p>
        </div>
      )}

      {!loading && arguments_.length > 0 && (
        <div className="space-y-2">
          {arguments_.map((arg) => {
            const CatIcon = categoryIcon[arg.category];
            const StatusIcon = statusIcon[arg.status];
            const isExpanded = expandedId === arg.id;
            return (
              <div key={arg.id} className="rounded-xl surface-flat overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : arg.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-fp-surface-2/40 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${categoryColor[arg.category]}`}>
                    <CatIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-fp-text truncate">{arg.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${categoryColor[arg.category].split(" ")[0]}`}>{arg.category}</span>
                      <span className="text-xs text-fp-text-dim">·</span>
                      <span className="text-xs text-fp-text-dim">{arg.findings.length} finding{arg.findings.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <StatusIcon className={`w-3.5 h-3.5 ${
                        arg.status === "ready" ? "text-fp-green" : arg.status === "strengthening" ? "text-fp-amber" : "text-fp-red"
                      }`} />
                      <span className="text-fp-text-dim hidden sm:inline">{statusLabel[arg.status]}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-fp-text-dim transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-fp-border/30 space-y-2">
                    <p className="text-sm text-fp-text-muted leading-relaxed">{arg.description}</p>
                    {arg.statutoryRef && (
                      <div className="text-xs text-fp-text-dim">
                        Statutory ref: <span className="font-mono text-fp-blue">{arg.statutoryRef}</span>
                      </div>
                    )}
                    {arg.findings.length > 1 && (
                      <div className="space-y-1.5 pt-2 border-t border-fp-border/30">
                        {arg.findings.slice(1).map((f) => (
                          <div key={f.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
                            <AlertTriangle className={`w-3 h-3 shrink-0 mt-0.5 ${
                              f.severity === "critical" ? "text-fp-red" : f.severity === "warning" ? "text-fp-amber" : "text-fp-text-dim"
                            }`} />
                            <div className="min-w-0">
                              <span className="text-fp-text font-medium">{f.rule_name || f.rule}</span>
                              {f.detail && <span className="text-fp-text-muted block truncate">{f.detail}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
