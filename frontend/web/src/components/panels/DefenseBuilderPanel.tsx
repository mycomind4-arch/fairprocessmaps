"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gavel,
  Shield,
  FileText,
  AlertTriangle,
  ChevronRight,
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Link2,
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

// ── Rule → defense category mapping ──────────────────────────────────────

const RULE_TO_CATEGORY: Record<string, "procedural" | "substantive" | "evidentiary"> = {
  // Procedural: notice, hearing, appeal process violations
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
  // Substantive: code interpretation, classification, overreach
  work_without_permit: "substantive",
  expired_permit: "substantive",
  no_permit: "substantive",
  nuisance: "substantive",
  substandard: "substantive",
  // Evidentiary: missing docs, contradictory records, chain of custody
  permit_after_ce_notice: "evidentiary",
  lien_without_ce_case: "evidentiary",
  incomplete_records: "evidentiary",
};

function categorizeRule(rule: string): "procedural" | "substantive" | "evidentiary" {
  if (rule.startsWith("statute_")) return "procedural"; // statute matches are procedural deadlines
  if (rule.startsWith("discrepancy_")) return "evidentiary"; // cross-source conflicts are evidentiary
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
  // Only use open findings (not superseded/closed/resolved)
  const activeFindings = findings.filter(f => f.status === "open");

  // Group findings by defense category
  const byCategory: Record<string, Finding[]> = {};
  for (const f of activeFindings) {
    const cat = categorizeRule(f.rule);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  // Group findings within each category into distinct arguments
  // Each unique rule becomes its own argument
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

  // Sort: procedural first, then substantive, then evidentiary
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
      // Re-fetch findings and regenerate arguments
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
              Auto-generated defense arguments from {findings.filter(f => f.status === "open").length} active due process findings. Each argument links to specific findings and statutory references.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2.5 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text hover:bg-fp-surface transition-colors"
              title="Refresh findings"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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

      {error && (
        <div className="glass rounded-[14px] p-4 border-fp-red/30 bg-fp-red/10 flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading defense arguments…
        </div>
      )}

      {/* Defense Strategy Framework */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-fp-blue" />
              <h3 className="text-sm font-semibold text-fp-text">Procedural Defenses</h3>
            </div>
            <p className="text-xs text-fp-text-dim mb-3">
              Notice defects, missed deadlines, jurisdiction errors, failure to follow required procedures.
            </p>
            <div className="text-2xl font-semibold text-fp-blue">{proceduralCount}</div>
          </div>

          <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-fp-amber" />
              <h3 className="text-sm font-semibold text-fp-text">Substantive Defenses</h3>
            </div>
            <p className="text-xs text-fp-text-dim mb-3">
              Misinterpretation of code, overreach, improper classification, factual disputes.
            </p>
            <div className="text-2xl font-semibold text-fp-amber">{substantiveCount}</div>
          </div>

          <div className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-fp-green" />
              <h3 className="text-sm font-semibold text-fp-text">Evidentiary Defenses</h3>
            </div>
            <p className="text-xs text-fp-text-dim mb-3">
              Missing documentation, unreliable evidence, chain of custody, contradictory records.
            </p>
            <div className="text-2xl font-semibold text-fp-green">{evidentiaryCount}</div>
          </div>
        </div>
      )}

      {/* Arguments List */}
      {!loading && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-fp-text">
            Defense Arguments {arguments_.length > 0 && `(${arguments_.length})`}
          </h3>

          {arguments_.map((arg) => {
            const CatIcon = categoryIcon[arg.category];
            const StatusIcon = statusIcon[arg.status];
            const isExpanded = expandedId === arg.id;

            return (
              <div
                key={arg.id}
                className="glass rounded-[14px] p-5 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
                onClick={() => setExpandedId(isExpanded ? null : arg.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="text-sm font-semibold text-fp-text">{arg.title}</h4>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${categoryColor[arg.category]}`}>
                        {arg.category}
                      </span>
                      {arg.statutoryRef && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-fp-surface-2 text-fp-text-dim border border-fp-border font-mono">
                          {arg.statutoryRef}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fp-text-muted">{arg.description}</p>

                    {isExpanded && (
                      <div className="pt-3 space-y-2 border-t border-fp-border/50">
                        <div className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide">
                          Supporting Findings ({arg.findings.length})
                        </div>
                        {arg.findings.map((f) => (
                          <div key={f.id} className="flex items-start gap-2 p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
                            <Link2 className="w-3.5 h-3.5 text-fp-blue shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  f.severity === "critical" ? "bg-fp-red/15 text-fp-red" :
                                  f.severity === "warning" ? "bg-fp-amber/15 text-fp-amber" :
                                  "bg-fp-surface-2 text-fp-text-dim"
                                }`}>
                                  {f.severity}
                                </span>
                                <span className="text-xs text-fp-text-muted font-mono">{f.rule}</span>
                              </div>
                              <p className="text-xs text-fp-text-muted mt-1">{f.detail}</p>
                              {f.evidence_id && (
                                <span className="text-xs text-fp-green flex items-center gap-1 mt-1">
                                  <Link2 className="w-3 h-3" /> Evidence linked
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!isExpanded && arg.findings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {arg.findings.slice(0, 3).map((f) => (
                          <span
                            key={f.id}
                            className="text-xs px-2 py-0.5 rounded-md bg-fp-surface-2 text-fp-text-dim border border-fp-border/40 font-mono"
                          >
                            {f.rule}
                          </span>
                        ))}
                        {arg.findings.length > 3 && (
                          <span className="text-xs text-fp-text-dim">
                            +{arg.findings.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={`w-3.5 h-3.5 ${
                        arg.status === "ready" ? "text-fp-green" :
                        arg.status === "strengthening" ? "text-fp-amber" :
                        "text-fp-text-dim"
                      }`} />
                      <span className="text-xs text-fp-text-dim">{statusLabel[arg.status]}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-fp-text-dim group-hover:text-fp-blue transition-all ${isExpanded ? "rotate-90" : ""}`} />
                  </div>
                </div>
              </div>
            );
          })}

          {arguments_.length === 0 && !loading && (
            <div className="glass rounded-[14px] p-12 text-center">
              <Gavel className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
              <h4 className="text-base font-semibold text-fp-text">No defense arguments yet</h4>
              <p className="text-sm text-fp-text-muted mt-1 mb-4">
                Run property intelligence recon to generate due process findings, then click "Auto-Build Arguments" to generate defense arguments from those findings.
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
      )}

      {/* Export hint */}
      {!loading && arguments_.length > 0 && (
        <div className="glass rounded-[14px] p-6 border-fp-blue/20">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-fp-blue" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-fp-text">Generate Legal Brief</h4>
              <p className="text-xs text-fp-text-muted mt-1">
                These defense arguments feed directly into the Brief Generator. Navigate to Legal Analysis → Brief Generator to export a motion, appeal letter, or complaint that cites these findings and statutory references.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
