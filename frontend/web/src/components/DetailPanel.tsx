"use client";

import { useEffect, useState } from "react";
import type {
  CaseSummary, CaseGraph, TimelineEntry, GraphNode,
  InvestigationFocus, NodeExplanation, EdgeProvenance,
} from "@/lib/graph/types";
import type { AgentProposal, ProposalStatus } from "@/lib/agents/types";
import { FileText, AlertTriangle, Scale, Network, Eye, HelpCircle, CheckCircle2, XCircle, Clock, Bot, Loader2 } from "lucide-react";

interface Props {
  graph: CaseGraph | null;
  summary: CaseSummary | null;
  caseId: string | null;
  selectedNode: string | null;
  selectedEvent: TimelineEntry | null;
  activeTab: "evidence" | "findings" | "authority" | "focus" | "agents";
  onTabChange: (tab: "evidence" | "findings" | "authority" | "focus" | "agents") => void;
}

const TAB_ICONS = { evidence: FileText, findings: AlertTriangle, authority: Scale, focus: Eye, agents: Bot };
const TAB_LABELS = { evidence: "Evidence", findings: "Findings", authority: "Authority", focus: "Investigation Focus", agents: "Agent Proposals" };

const OBSERVATION_ICONS: Record<string, string> = {
  timeline_gap: "⏱", sequence_anomaly: "⚠", missing_notice: "📋",
  deadline_passed: "📅", authority_gap: "⚖", evidence_gap: "📎",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-fp-red border-fp-red/30 bg-fp-red/5",
  warning: "text-fp-amber border-fp-amber/30 bg-fp-amber/5",
  info: "text-fp-blue border-fp-blue/30 bg-fp-blue/5",
};

const CHECK_STATUS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  met: { icon: CheckCircle2, color: "text-fp-green" },
  unclear: { icon: HelpCircle, color: "text-fp-amber" },
  missing: { icon: XCircle, color: "text-fp-red" },
  not_applicable: { icon: Clock, color: "text-fp-text-dim" },
};

export default function DetailPanel({
  graph, summary, caseId, selectedNode, selectedEvent, activeTab, onTabChange,
}: Props) {
  const [focus, setFocus] = useState<InvestigationFocus | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [focusLoading, setFocusLoading] = useState(false);
  const [explanation, setExplanation] = useState<NodeExplanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Fetch Investigation Focus when focus tab is opened
  useEffect(() => {
    if (activeTab === "focus" && !focus && caseId && !focusLoading) {
      setFocusLoading(true);
      fetch(`/api/v1/cases/${caseId}/focus`)
        .then(r => r.json())
        .then((d: any) => { if (d.ok) setFocus(d.data); })
        .catch(() => {})
        .finally(() => setFocusLoading(false));
    }
  }, [activeTab, focus, caseId, focusLoading]);

  // Fetch Agent Proposals when agents tab is opened
  useEffect(() => {
    if (activeTab === "agents" && proposals.length === 0 && caseId && !proposalsLoading) {
      setProposalsLoading(true);
      fetch(`/api/v1/cases/${caseId}/agents/proposals`)
        .then(r => r.json())
        .then((d: any) => { if (d.ok) setProposals(d.data.proposals); })
        .catch(() => {})
        .finally(() => setProposalsLoading(false));
    }
  }, [activeTab, proposals, caseId, proposalsLoading]);

  // Fetch "Why am I seeing this?" when a node is selected
  useEffect(() => {
    if (selectedNode && caseId) {
      setExplanation(null);
      setExplanationLoading(true);
      fetch(`/api/v1/cases/${caseId}/explain?nodeId=${selectedNode}`)
        .then(r => r.json())
        .then((d: any) => { if (d.ok) setExplanation(d.data); })
        .catch(() => {})
        .finally(() => setExplanationLoading(false));
    } else {
      setExplanation(null);
    }
  }, [selectedNode, caseId]);

  const node = graph?.nodes.find(n => n.id === selectedNode) ?? null;
  const edges = graph?.edges.filter(e => e.source === selectedNode || e.target === selectedNode) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-2 border-b border-fp-border/50">
        {(Object.keys(TAB_LABELS) as ("evidence" | "findings" | "authority" | "focus" | "agents")[]).map((tab) => {
          const Icon = TAB_ICONS[tab];
          const isActive = activeTab === tab;
          return (
            <button key={tab} onClick={() => onTabChange(tab)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive ? "bg-fp-blue/15 text-fp-blue" : "text-fp-text-dim hover:text-fp-text-muted hover:bg-fp-surface-2"
              }`}>
              <Icon className="w-3 h-3" />
              {TAB_LABELS[tab]}
              {tab === "focus" && focus && focus.observations.length > 0 && (
                <span className="ml-1 px-1 py-0 rounded text-[9px] bg-fp-amber/20 text-fp-amber">{focus.observations.length}</span>
              )}
              {tab === "focus" && focus && focus.pending_agent_proposals > 0 && (
                <span className="ml-1 px-1 py-0 rounded text-[9px] bg-fp-red/20 text-fp-red">{focus.pending_agent_proposals} pending</span>
              )}
              {tab === "agents" && proposals.filter(p => p.status === "pending").length > 0 && (
                <span className="ml-1 px-1 py-0 rounded text-[9px] bg-fp-red/20 text-fp-red">{proposals.filter(p => p.status === "pending").length}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* "Why am I seeing this?" — shown when a node is selected, regardless of tab */}
        {selectedNode && explanation && (
          <div className="mb-4 p-6 rounded-[14px] bg-fp-surface-2 border border-fp-blue/30">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-3.5 h-3.5 text-fp-cyan" />
              <span className="text-xs font-semibold text-fp-cyan uppercase tracking-wider">Why am I seeing this?</span>
            </div>
            <div className="space-y-1.5">
              {explanation.reasons.map((reason, i) => (
                <div key={i} className="text-xs text-fp-text-muted flex items-start gap-2">
                  <span className="text-fp-text-dim shrink-0 mt-0.5">•</span>
                  <div>
                    <span>{reason.description}</span>
                    {reason.confidence != null && (
                      <span className="text-fp-purple ml-1.5">({(reason.confidence * 100).toFixed(0)}% confidence)</span>
                    )}
                    {reason.edge_provenance?.status === "rejected" && (
                      <span className="text-fp-red ml-1.5">⚠ rejected: {reason.edge_provenance.review_reason}</span>
                    )}
                    {reason.edge_provenance?.status === "pending_review" && reason.edge_provenance.source === "relationship_table" && (
                      <span className="text-fp-amber ml-1.5">⏳ pending review</span>
                    )}
                    {reason.evidence_ids && reason.evidence_ids.length > 0 && (
                      <span className="text-fp-cyan ml-1.5">📎 {reason.evidence_ids.length} evidence</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedNode && explanationLoading && (
          <div className="mb-4 p-3 rounded-lg bg-fp-surface-2 border border-fp-cyan/30 text-xs text-fp-text-dim">
            Loading explanation…
          </div>
        )}

        {/* Selected node details */}
        {node && (
          <div className="mb-4 p-6 rounded-[14px] bg-fp-surface-2 border border-fp-border">
            <div className="flex items-center gap-2 mb-2">
              <Network className="w-3.5 h-3.5 text-fp-cyan" />
              <span className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">{node.type}</span>
              {node.relevance_score != null && node.relevance_score >= 50 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-fp-amber/20 text-fp-amber">
                  Relevance: {node.relevance_score}
                </span>
              )}
            </div>
            <h3 className="text-sm font-medium text-fp-text mb-2">{node.label}</h3>
            <div className="space-y-1">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-fp-text-dim">{key}:</span>
                  <span className="text-fp-text-muted text-right max-w-[200px] truncate">
                    {value === null ? "—" : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected edges with provenance */}
        {node && edges.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
              Connections ({edges.length})
            </h4>
            <div className="space-y-1.5">
              {edges.map((edge, i) => {
                const otherId = edge.source === selectedNode ? edge.target : edge.source;
                const otherNode = graph?.nodes.find(n => n.id === otherId);
                const isSemantic = edge.provenance?.source === "relationship_table";
                const isRejected = edge.provenance?.status === "rejected";
                const isPending = edge.provenance?.status === "pending_review";

                return (
                  <div key={`edge-${i}`}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                      isRejected ? "bg-fp-red/5 border-fp-red/20" :
                      isPending ? "bg-fp-amber/5 border-fp-amber/20" :
                      "bg-fp-surface/60 border-fp-border/50"
                    }`}>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isSemantic ? "bg-fp-purple/20 text-fp-purple" : "bg-fp-blue/20 text-fp-blue"
                    }`}>
                      {edge.type_label || edge.type}
                    </span>
                    <span className="text-fp-text-muted">→</span>
                    <span className="text-fp-text">{otherNode?.label || otherId.slice(0, 12)}</span>
                    <span className="text-fp-text-dim text-[10px]">{otherNode?.type}</span>
                    {isSemantic && edge.provenance && (
                      <span className="ml-auto text-[10px] text-fp-text-dim flex items-center gap-1.5">
                        {edge.provenance.confidence != null && `${(edge.provenance.confidence * 100).toFixed(0)}%`}
                        {isRejected && <span className="text-fp-red">rejected</span>}
                        {isPending && <span className="text-fp-amber">pending</span>}
                        {edge.provenance.created_by && <span>by {edge.provenance.created_by}</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected event details */}
        {selectedEvent && !node && (
          <div className="mb-4 p-6 rounded-[14px] bg-fp-surface-2 border border-fp-border">
            <div className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider mb-2">Event</div>
            <h3 className="text-sm font-medium text-fp-text">{selectedEvent.type_label}</h3>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-fp-text-dim">Date:</span><span className="text-fp-text-muted">{selectedEvent.date}</span></div>
              <div className="flex justify-between"><span className="text-fp-text-dim">Actor:</span><span className="text-fp-text-muted">{selectedEvent.actor.type} / {selectedEvent.actor.id}</span></div>
              {selectedEvent.agent_version && <div className="flex justify-between"><span className="text-fp-text-dim">Agent version:</span><span className="text-fp-purple">v{selectedEvent.agent_version}</span></div>}
              {selectedEvent.evidence_id && <div className="flex justify-between"><span className="text-fp-text-dim">Evidence:</span><span className="text-fp-cyan">{selectedEvent.evidence_id.slice(0, 12)}…</span></div>}
            </div>
            {selectedEvent.description && <p className="mt-2 text-xs text-fp-text-dim">{selectedEvent.description}</p>}
          </div>
        )}

        {/* ── Investigation Focus tab ── */}
        {activeTab === "focus" && (
          <div className="space-y-4">
            {focusLoading && <p className="text-sm text-fp-text-dim text-center py-4">Analyzing case…</p>}
            {focus && (
              <>
                {/* Observations */}
                <div>
                  <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
                    Observations ({focus.observations.length})
                  </h4>
                  {focus.observations.length === 0 ? (
                    <p className="text-sm text-fp-text-dim">No anomalies detected</p>
                  ) : (
                    <div className="space-y-1.5">
                      {focus.observations.map((obs, i) => (
                        <div key={i} className={`p-2.5 rounded-lg border text-xs ${SEVERITY_COLORS[obs.severity] || SEVERITY_COLORS.info}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span>{OBSERVATION_ICONS[obs.type] || "•"}</span>
                            <span className="font-medium">{obs.type.replace(/_/g, " ")}</span>
                            {obs.date && <span className="text-fp-text-dim ml-auto">{obs.date}</span>}
                          </div>
                          <p className="text-fp-text-muted">{obs.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Procedural Checks */}
                <div>
                  <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
                    Procedural Checks ({focus.procedural_checks.length})
                  </h4>
                  {focus.procedural_checks.length === 0 ? (
                    <p className="text-sm text-fp-text-dim">No procedural checks applicable</p>
                  ) : (
                    <div className="space-y-1.5">
                      {focus.procedural_checks.map((check, i) => {
                        const StatusIcon = CHECK_STATUS[check.status]?.icon || HelpCircle;
                        const statusColor = CHECK_STATUS[check.status]?.color || "text-fp-text-dim";
                        return (
                          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-fp-surface/60 border border-fp-border/50 text-xs">
                            <StatusIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${statusColor}`} />
                            <div>
                              <div className="font-medium text-fp-text">{check.requirement}</div>
                              <div className="text-fp-text-dim mt-0.5">
                                Status: <span className={statusColor}>{check.status}</span>
                                {check.detail && <span className="ml-1.5">— {check.detail}</span>}
                              </div>
                              {check.evidence_ids.length > 0 && (
                                <div className="text-fp-cyan mt-0.5">📎 {check.evidence_ids.length} evidence</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Missing Information */}
                <div>
                  <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
                    Missing Information ({focus.missing_information.length})
                  </h4>
                  {focus.missing_information.length === 0 ? (
                    <p className="text-sm text-fp-text-dim">No missing information identified</p>
                  ) : (
                    <div className="space-y-1.5">
                      {focus.missing_information.map((info, i) => (
                        <div key={i} className={`p-2.5 rounded-lg border text-xs ${
                          info.importance === "critical" ? "border-fp-red/30 bg-fp-red/5" :
                          info.importance === "recommended" ? "border-fp-amber/30 bg-fp-amber/5" :
                          "border-fp-border/50 bg-fp-surface/60"
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-medium ${
                              info.importance === "critical" ? "text-fp-red" :
                              info.importance === "recommended" ? "text-fp-amber" : "text-fp-text-muted"
                            }`}>{info.importance}</span>
                            <span className="text-fp-text-dim">• {info.type}</span>
                          </div>
                          <p className="text-fp-text-muted">{info.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Supporting Evidence */}
                <div>
                  <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
                    Supporting Evidence ({focus.supporting_evidence.length})
                  </h4>
                  {focus.supporting_evidence.length === 0 ? (
                    <p className="text-sm text-fp-text-dim">No processed evidence available</p>
                  ) : (
                    <div className="space-y-1">
                      {focus.supporting_evidence.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded text-xs text-fp-text-muted">
                          <FileText className="w-3 h-3 text-fp-cyan" />
                          <span>{ev.evidence_title}</span>
                          <span className="text-fp-text-dim ml-auto">{ev.relevance}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Evidence tab */}
        {activeTab === "evidence" && (
          <div className="space-y-2">
            {graph?.nodes.filter(n => n.type === "evidence").map(n => {
              const data = n.data as Record<string, unknown>;
              return (
                <div key={n.id} className="p-2.5 rounded-lg bg-fp-surface/60 border border-fp-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-fp-text font-medium">{n.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      data.withdrawn ? "bg-fp-red/20 text-fp-red" : "bg-fp-green/20 text-fp-green"
                    }`}>{data.status as string}</span>
                  </div>
                  <div className="text-xs text-fp-text-dim">{data.doc_type as string || "document"}</div>
                </div>
              );
            }) ?? []}
            {graph && graph.nodes.filter(n => n.type === "evidence").length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No evidence in this case</p>
            )}
          </div>
        )}

        {/* Findings tab */}
        {activeTab === "findings" && (
          <div className="space-y-2">
            {graph?.nodes.filter(n => n.type === "finding").map(n => {
              const data = n.data as Record<string, unknown>;
              const severity = data.severity as string;
              return (
                <div key={n.id} className={`p-2.5 rounded-lg border ${
                  severity === "critical" ? "bg-fp-red/5 border-fp-red/30" : "bg-fp-surface/60 border-fp-border/50"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-fp-text font-medium">{n.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
                      severity === "critical" ? "bg-fp-red/20 text-fp-red" :
                      severity === "warning" ? "bg-fp-amber/20 text-fp-amber" :
                      "bg-fp-blue/20 text-fp-blue"
                    }`}>{severity}</span>
                  </div>
                  {Boolean(data.detail) && <p className="text-xs text-fp-text-dim mt-1">{String(data.detail)}</p>}
                  {Boolean(data.generated_by_agent) && (
                    <div className="text-[10px] text-fp-purple mt-1">🤖 {String(data.generated_by_agent)}{data.agent_version ? ` v${data.agent_version}` : ""}</div>
                  )}
                </div>
              );
            }) ?? []}
            {graph && graph.nodes.filter(n => n.type === "finding").length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No findings in this case</p>
            )}
          </div>
        )}

        {/* Authority tab */}
        {activeTab === "authority" && (
          <div className="space-y-2">
            {graph?.edges.filter(e => {
              const sn = graph.nodes.find(n => n.id === e.source);
              const tn = graph.nodes.find(n => n.id === e.target);
              const at = ["statute", "official", "department", "authority"];
              return (sn && at.includes(sn.type)) || (tn && at.includes(tn.type));
            }).map((edge, i) => {
              const sn = graph.nodes.find(n => n.id === edge.source);
              const tn = graph.nodes.find(n => n.id === edge.target);
              return (
                <div key={`auth-${i}`} className="p-2.5 rounded-lg bg-fp-surface/60 border border-fp-border/50">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-fp-text">{sn?.label}</span>
                    <span className="text-fp-purple text-[10px] px-1.5 py-0.5 rounded bg-fp-purple/20">{edge.type_label || edge.type}</span>
                    <span className="text-fp-text">{tn?.label}</span>
                  </div>
                  {edge.provenance?.source === "relationship_table" && (
                    <div className="text-[10px] text-fp-text-dim mt-1">
                      Semantic claim
                      {edge.provenance.confidence != null && ` • ${(edge.provenance.confidence * 100).toFixed(0)}% confidence`}
                      {edge.provenance.created_by && ` • by ${edge.provenance.created_by}`}
                      {edge.provenance.status === "rejected" && ` • ⚠ rejected: ${edge.provenance.review_reason}`}
                      {edge.provenance.status === "pending_review" && ` • ⏳ pending review`}
                    </div>
                  )}
                </div>
              );
            }) ?? []}
            {graph && graph.edges.filter(e => {
              const sn = graph.nodes.find(n => n.id === e.source);
              const tn = graph.nodes.find(n => n.id === e.target);
              const at = ["statute", "official", "department", "authority"];
              return (sn && at.includes(sn.type)) || (tn && at.includes(tn.type));
            }).length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No authority relationships in this case yet</p>
            )}
          </div>
        )}


        {/* Agent Proposals tab */}
        {activeTab === "agents" && (
          <div className="space-y-3">
            {proposalsLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-fp-text-dim" />
                <span className="ml-2 text-sm text-fp-text-dim">Loading proposals…</span>
              </div>
            )}
            {!proposalsLoading && proposals.filter(p => p.status === "pending").length === 0 && proposals.filter(p => p.status !== "pending").length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No agent proposals for this case yet</p>
            )}
            {/* Pending proposals */}
            {proposals.filter(p => p.status === "pending").length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-fp-amber uppercase tracking-wider mb-2">
                  Pending Review ({proposals.filter(p => p.status === "pending").length})
                </h4>
                <div className="space-y-2">
                  {proposals.filter(p => p.status === "pending").map((proposal) => (
                    <div key={proposal.id} className="p-3 rounded-lg bg-fp-surface-2 border border-fp-amber/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-3.5 h-3.5 text-fp-purple" />
                        <span className="text-xs font-medium text-fp-text">{proposal.agent_id}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-fp-purple/20 text-fp-purple">{proposal.proposal_type.replace(/_/g, " ")}</span>
                        {proposal.confidence != null && (
                          <span className="text-[10px] text-fp-text-dim ml-auto">{(proposal.confidence * 100).toFixed(0)}% confidence</span>
                        )}
                      </div>
                      {proposal.proposal_type === "relationship_proposal" && (
                        <p className="text-xs text-fp-text-muted">
                          {proposal.source_type} → <span className="text-fp-purple">{proposal.relationship_type}</span> → {proposal.target_type}
                        </p>
                      )}
                      {proposal.description && <p className="text-xs text-fp-text-muted mt-1">{proposal.description}</p>}
                      {proposal.requirement && (
                        <p className="text-xs text-fp-text-muted mt-1">
                          <span className="font-medium">{proposal.requirement}</span>: {proposal.check_status}
                          {proposal.check_detail && <span className="text-fp-text-dim"> — {proposal.check_detail}</span>}
                        </p>
                      )}
                      {proposal.reasoning_trace && (
                        <p className="text-[11px] text-fp-text-dim mt-1.5 italic">{proposal.reasoning_trace}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => {
                            fetch(`/api/v1/agents/proposals/${proposal.id}/review`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ decision: "accepted" }),
                            }).then(r => r.json()).then((d: any) => {
                              if (d.ok) {
                                setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "accepted" as ProposalStatus } : p));
                              }
                            });
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-fp-green/15 text-fp-green hover:bg-fp-green/25 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            fetch(`/api/v1/agents/proposals/${proposal.id}/review`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ decision: "rejected", review_reason: "Reviewed and rejected" }),
                            }).then(r => r.json()).then((d: any) => {
                              if (d.ok) {
                                setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "rejected" as ProposalStatus } : p));
                              }
                            });
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-fp-red/15 text-fp-red hover:bg-fp-red/25 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Reviewed proposals (history) */}
            {proposals.filter(p => p.status !== "pending").length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wide mb-3">
                  Reviewed ({proposals.filter(p => p.status !== "pending").length})
                </h4>
                <div className="space-y-1.5">
                  {proposals.filter(p => p.status !== "pending").map((proposal) => (
                    <div key={proposal.id} className={`p-2.5 rounded-lg border text-xs ${
                      proposal.status === "accepted" ? "bg-fp-green/5 border-fp-green/20" : "bg-fp-red/5 border-fp-red/20"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Bot className="w-3 h-3 text-fp-purple" />
                        <span className="text-fp-text-muted">{proposal.agent_id}</span>
                        <span className="text-fp-text-dim">· {proposal.proposal_type.replace(/_/g, " ")}</span>
                        <span className={`ml-auto text-[10px] font-medium ${
                          proposal.status === "accepted" ? "text-fp-green" : "text-fp-red"
                        }`}>{proposal.status}</span>
                      </div>
                      {proposal.description && <p className="text-fp-text-dim mt-1">{proposal.description}</p>}
                      {proposal.review_reason && <p className="text-fp-text-dim italic mt-0.5">Reason: {proposal.review_reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!node && !selectedEvent && activeTab !== "focus" && (
          <div className="flex items-center justify-center h-full text-fp-text-dim text-sm">
            Select a node or event to see details
          </div>
        )}
      </div>
    </div>
  );
}
