"use client";

import type { CaseSummary, CaseGraph, TimelineEntry, GraphNode } from "@/lib/graph/types";
import { FileText, AlertTriangle, Scale, Network } from "lucide-react";

interface Props {
  graph: CaseGraph | null;
  summary: CaseSummary | null;
  selectedNode: string | null;
  selectedEvent: TimelineEntry | null;
  activeTab: "evidence" | "findings" | "authority";
  onTabChange: (tab: "evidence" | "findings" | "authority") => void;
}

const TAB_ICONS = {
  evidence: FileText,
  findings: AlertTriangle,
  authority: Scale,
};

const TAB_LABELS = {
  evidence: "Evidence",
  findings: "Findings",
  authority: "Authority",
};

export default function DetailPanel({
  graph,
  summary,
  selectedNode,
  selectedEvent,
  activeTab,
  onTabChange,
}: Props) {
  // Find the selected node in the graph
  const node = graph?.nodes.find((n) => n.id === selectedNode) ?? null;
  const edges = graph?.edges.filter(
    (e) => e.source === selectedNode || e.target === selectedNode,
  ) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-fp-border/50">
        {(Object.keys(TAB_LABELS) as ("evidence" | "findings" | "authority")[]).map((tab) => {
          const Icon = TAB_ICONS[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-fp-blue/15 text-fp-blue"
                  : "text-fp-text-dim hover:text-fp-text-muted hover:bg-fp-surface-2"
              }`}
            >
              <Icon className="w-3 h-3" />
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Selected node details (shown regardless of tab) */}
        {node && (
          <div className="mb-4 p-3 rounded-lg bg-fp-surface-2 border border-fp-border">
            <div className="flex items-center gap-2 mb-2">
              <Network className="w-3.5 h-3.5 text-fp-cyan" />
              <span className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">
                {node.type}
              </span>
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

        {/* Connected edges (shown when a node is selected) */}
        {node && edges.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider mb-2">
              Connections ({edges.length})
            </h4>
            <div className="space-y-1.5">
              {edges.map((edge, i) => {
                const otherId = edge.source === selectedNode ? edge.target : edge.source;
                const otherNode = graph?.nodes.find((n) => n.id === otherId);
                const isSemantic = edge.provenance?.source === "relationship_table";

                return (
                  <div
                    key={`edge-${i}`}
                    className="flex items-center gap-2 p-2 rounded-lg bg-fp-surface/60 border border-fp-border/50 text-xs"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isSemantic
                        ? "bg-fp-purple/20 text-fp-purple"
                        : "bg-fp-blue/20 text-fp-blue"
                    }`}>
                      {edge.type_label || edge.type}
                    </span>
                    <span className="text-fp-text-muted">→</span>
                    <span className="text-fp-text">{otherNode?.label || otherId.slice(0, 12)}</span>
                    <span className="text-fp-text-dim text-[10px]">{otherNode?.type}</span>

                    {/* Provenance for semantic edges */}
                    {isSemantic && edge.provenance && (
                      <span className="ml-auto text-[10px] text-fp-text-dim">
                        {edge.provenance.confidence != null && `${(edge.provenance.confidence * 100).toFixed(0)}%`}
                        {edge.provenance.created_by && ` by ${edge.provenance.created_by}`}
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
          <div className="mb-4 p-3 rounded-lg bg-fp-surface-2 border border-fp-border">
            <div className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider mb-2">
              Event
            </div>
            <h3 className="text-sm font-medium text-fp-text">{selectedEvent.type_label}</h3>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-fp-text-dim">Date:</span>
                <span className="text-fp-text-muted">{selectedEvent.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fp-text-dim">Actor:</span>
                <span className="text-fp-text-muted">{selectedEvent.actor.type} / {selectedEvent.actor.id}</span>
              </div>
              {selectedEvent.agent_version && (
                <div className="flex justify-between">
                  <span className="text-fp-text-dim">Agent version:</span>
                  <span className="text-fp-purple">v{selectedEvent.agent_version}</span>
                </div>
              )}
              {selectedEvent.evidence_id && (
                <div className="flex justify-between">
                  <span className="text-fp-text-dim">Evidence:</span>
                  <span className="text-fp-cyan">{selectedEvent.evidence_id.slice(0, 12)}…</span>
                </div>
              )}
            </div>
            {selectedEvent.description && (
              <p className="mt-2 text-xs text-fp-text-dim">{selectedEvent.description}</p>
            )}
          </div>
        )}

        {/* Tab-specific content */}
        {activeTab === "evidence" && (
          <div className="space-y-2">
            {graph?.nodes.filter((n) => n.type === "evidence").map((n) => (
              <div key={n.id} className="p-2.5 rounded-lg bg-fp-surface/60 border border-fp-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-fp-text font-medium">{n.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    (n.data as Record<string, unknown>).withdrawn ? "bg-fp-red/20 text-fp-red" : "bg-fp-green/20 text-fp-green"
                  }`}>
                    {(n.data as Record<string, unknown>).status as string}
                  </span>
                </div>
                <div className="text-xs text-fp-text-dim">
                  {(n.data as Record<string, unknown>).doc_type as string || "document"}
                </div>
              </div>
            )) ?? []}
            {graph && graph.nodes.filter((n) => n.type === "evidence").length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No evidence in this case</p>
            )}
          </div>
        )}

        {activeTab === "findings" && (
          <div className="space-y-2">
            {graph?.nodes.filter((n) => n.type === "finding").map((n) => {
              const data = n.data as Record<string, unknown>;
              const severity = data.severity as string;
              return (
                <div key={n.id} className={`p-2.5 rounded-lg border ${
                  severity === "critical"
                    ? "bg-fp-red/5 border-fp-red/30"
                    : "bg-fp-surface/60 border-fp-border/50"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-fp-text font-medium">{n.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
                      severity === "critical" ? "bg-fp-red/20 text-fp-red" :
                      severity === "warning" ? "bg-fp-amber/20 text-fp-amber" :
                      "bg-fp-blue/20 text-fp-blue"
                    }`}>
                      {severity}
                    </span>
                  </div>
                  {data.detail && (
                    <p className="text-xs text-fp-text-dim mt-1">{data.detail as string}</p>
                  )}
                  {data.generated_by_agent && (
                    <div className="text-[10px] text-fp-purple mt-1">
                      🤖 {data.generated_by_agent as string}
                      {data.agent_version && ` v${data.agent_version}`}
                    </div>
                  )}
                </div>
              );
            }) ?? []}
            {graph && graph.nodes.filter((n) => n.type === "finding").length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">No findings in this case</p>
            )}
          </div>
        )}

        {activeTab === "authority" && (
          <div className="space-y-2">
            {/* Show semantic relationships with authority-related types */}
            {graph?.edges
              .filter((e) => {
                const sourceNode = graph.nodes.find((n) => n.id === e.source);
                const targetNode = graph.nodes.find((n) => n.id === e.target);
                const authorityTypes = ["statute", "official", "department", "authority"];
                return (
                  (sourceNode && authorityTypes.includes(sourceNode.type)) ||
                  (targetNode && authorityTypes.includes(targetNode.type))
                );
              })
              .map((edge, i) => {
                const sourceNode = graph.nodes.find((n) => n.id === edge.source);
                const targetNode = graph.nodes.find((n) => n.id === edge.target);
                return (
                  <div key={`auth-${i}`} className="p-2.5 rounded-lg bg-fp-surface/60 border border-fp-border/50">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-fp-text">{sourceNode?.label}</span>
                      <span className="text-fp-purple text-[10px] px-1.5 py-0.5 rounded bg-fp-purple/20">
                        {edge.type_label || edge.type}
                      </span>
                      <span className="text-fp-text">{targetNode?.label}</span>
                    </div>
                    {edge.provenance?.source === "relationship_table" && (
                      <div className="text-[10px] text-fp-text-dim mt-1">
                        Semantic claim
                        {edge.provenance.confidence != null && ` • ${(edge.provenance.confidence * 100).toFixed(0)}% confidence`}
                        {edge.provenance.created_by && ` • by ${edge.provenance.created_by}`}
                      </div>
                    )}
                  </div>
                );
              }) ?? []}
            {graph && graph.edges.filter((e) => {
              const sn = graph.nodes.find((n) => n.id === e.source);
              const tn = graph.nodes.find((n) => n.id === e.target);
              const at = ["statute", "official", "department", "authority"];
              return (sn && at.includes(sn.type)) || (tn && at.includes(tn.type));
            }).length === 0 && (
              <p className="text-sm text-fp-text-dim text-center py-4">
                No authority relationships in this case yet
              </p>
            )}
          </div>
        )}

        {/* Empty state when nothing is selected */}
        {!node && !selectedEvent && (
          <div className="flex items-center justify-center h-full text-fp-text-dim text-sm">
            Select a node or event to see details
          </div>
        )}
      </div>
    </div>
  );
}
