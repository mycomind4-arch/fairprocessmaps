"use client";

import { useState, useEffect } from "react";
import { Network, Activity, Loader2 } from "lucide-react";
import InvestigationGraph from "../InvestigationGraph";
import DetailPanel from "../DetailPanel";
import { InvestigationFeedPanel } from "./InvestigationFeed";

type GraphTab = "graph" | "feed";

const TABS: { id: GraphTab; label: string; icon: typeof Network }[] = [
  { id: "graph", label: "Investigation Graph", icon: Network },
  { id: "feed", label: "Activity Feed", icon: Activity },
];

export default function CaseGraphPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<GraphTab>("graph");
  const [graphData, setGraphData] = useState<any>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "graph" || graphData || graphLoading) return;
    setGraphLoading(true);
    fetch(`/api/v1/cases/${projectId}/graph`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => r.json())
      .then((d: any) => {
        setGraphData(d.ok ? d.data : null);
        setGraphLoading(false);
      })
      .catch(() => setGraphLoading(false));
  }, [projectId, tab, graphData, graphLoading]);

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Case Graph">
      <div className="flex items-center gap-1 border-b border-fp-border pb-px overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={active}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                active
                  ? "text-fp-blue border-fp-blue"
                  : "text-fp-text-muted hover:text-fp-text border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "graph" && (
        <div className="flex flex-col gap-4">
          <InvestigationGraph
            nodes={graphData?.nodes || []}
            edges={graphData?.edges || []}
            selectedNode={selectedNode}
            highlightedNodes={new Set()}
            onNodeClick={(nodeId) => setSelectedNode(nodeId)}
          />
          {graphData && selectedNode && (
            <DetailPanel
              graph={graphData}
              summary={graphData?.summary || null}
              caseId={projectId}
              selectedNode={selectedNode}
              selectedEvent={null}
              activeTab="evidence"
              onTabChange={() => {}}
            />
          )}
          {graphLoading && (
            <div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading case graph…
            </div>
          )}
          {graphData && !graphData.nodes?.length && !graphLoading && (
            <div className="flex flex-col items-center justify-center p-8 text-fp-text-dim text-sm gap-2">
              <Network className="w-8 h-8 text-fp-text-dim" />
              <p>No graph data yet. Run recon to build the case graph.</p>
            </div>
          )}
        </div>
      )}

      {tab === "feed" && <InvestigationFeedPanel projectId={projectId} />}
    </div>
  );
}
