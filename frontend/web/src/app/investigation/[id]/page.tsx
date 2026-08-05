"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { CaseSummary, CaseGraph, CaseTimeline, TimelineEntry } from "@/lib/graph/types";
import { ArrowLeft, Shield, Loader2, AlertTriangle, Clock, MapPin, FileText, Scale, Network, ChevronRight, Filter, Bot } from "lucide-react";
import InvestigationGraph from "@/components/InvestigationGraph";
import TimelineList from "@/components/TimelineList";
import DetailPanel from "@/components/DetailPanel";

export default function InvestigationView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [graph, setGraph] = useState<CaseGraph | null>(null);
  const [timeline, setTimeline] = useState<CaseTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [activeDetailTab, setActiveDetailTab] = useState<"evidence" | "findings" | "authority" | "focus" | "agents">("evidence");
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [summaryRes, graphRes, timelineRes] = await Promise.all([
        fetch(`/api/v1/cases/${id}/summary`).then(r => r.json() as Promise<any>),
        fetch(`/api/v1/cases/${id}/graph`).then(r => r.json() as Promise<any>),
        fetch(`/api/v1/cases/${id}/timeline`).then(r => r.json() as Promise<any>),
      ]);
      if (summaryRes.ok) setSummary(summaryRes.data);
      if (graphRes.ok) {
        setGraph(graphRes.data);
        const types: Set<string> = new Set(graphRes.data.nodes.map((n: any) => n.type as string));
        setVisibleNodeTypes(types);
      }
      if (timelineRes.ok) setTimeline(timelineRes.data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEventClick = (entry: TimelineEntry) => {
    setSelectedEvent(entry.id);
    const nodes = new Set<string>();
    if (entry.evidence_id) nodes.add(entry.evidence_id);
    if (entry.entity_id) nodes.add(entry.entity_id);
    if (graph) nodes.add(graph.case.id);
    setHighlightedNodes(nodes);
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEvent(null);
    setHighlightedNodes(new Set([nodeId]));
  };

  const toggleNodeType = (type: string) => {
    setVisibleNodeTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  if (authLoading || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <Loader2 className="w-6 h-6 animate-spin text-fp-blue" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fp-bg gap-3">
        <Scale className="w-8 h-8 text-fp-text-dim" />
        <p className="text-fp-text-muted">Case not found</p>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-fp-blue hover:text-fp-cyan">
          Back to dashboard
        </button>
      </div>
    );
  }

  const visibleNodes = graph?.nodes.filter(n => visibleNodeTypes.has(n.type)) ?? [];
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = graph?.edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)) ?? [];

  return (
    <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
      {/* Case Header */}
      <header className="shrink-0 border-b border-fp-border bg-fp-surface/60 backdrop-blur-xl">
        <div className="flex items-center gap-4 px-6 py-3">
          <button onClick={() => router.push("/dashboard")} className="text-fp-text-dim hover:text-fp-text transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-fp-text leading-tight">{summary.case_name}</h1>
              <div className="flex items-center gap-2 text-xs text-fp-text-dim mt-0.5">
                <MapPin className="w-3 h-3" />
                <span>{summary.property.address || summary.property.apn}</span>
                <span>•</span>
                <span>{summary.jurisdiction}</span>
                <span>•</span>
                <span className={summary.status === "open" ? "text-fp-amber" : "text-fp-green"}>{summary.status}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {summary.risk_indicators.map((risk, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                risk.severity === "critical" ? "border-fp-red/30 bg-fp-red/10 text-fp-red" :
                risk.severity === "warning" ? "border-fp-amber/30 bg-fp-amber/10 text-fp-amber" :
                "border-fp-green/30 bg-fp-green/10 text-fp-green"
              }`}>
                <AlertTriangle className="w-3 h-3" />
                {risk.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 px-6 py-2 border-t border-fp-border/50 text-xs text-fp-text-dim">
          <span className="flex items-center gap-1.5"><FileText className="w-3 h-3" />{summary.evidence_count} evidence</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" />{summary.open_findings_count} open findings{summary.critical_findings_count > 0 && <span className="text-fp-red">({summary.critical_findings_count} critical)</span>}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{summary.timeline_event_count} events</span>
          {summary.last_action.date && (
            <span className="flex items-center gap-1.5">Last: {summary.last_action.type_label || summary.last_action.type}<span className="text-fp-text-muted">{summary.last_action.date}</span></span>
          )}
        </div>
      </header>

      {/* Timeline | Graph */}
      <div className="flex-1 flex min-h-0">
        <div className="w-80 shrink-0 border-r border-fp-border bg-fp-surface/40 overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 py-2.5 border-b border-fp-border/50 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-fp-text-dim" />
            <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Timeline</h2>
            <span className="ml-auto text-xs text-fp-text-dim">{timeline?.events.length ?? 0}</span>
          </div>
          <TimelineList events={timeline?.events ?? []} selectedEvent={selectedEvent} onEventClick={handleEventClick} />
        </div>

        <div className="flex-1 min-w-0 relative overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 py-2.5 border-b border-fp-border/50 flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-fp-text-dim" />
            <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Relationship Graph</h2>

            <div className="ml-auto flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-fp-text-dim" />
              {["property", "case", "evidence", "finding", "permit", "ce_case", "event"].map(type => {
                const active = visibleNodeTypes.has(type);
                const count = graph?.nodes.filter(n => n.type === type).length ?? 0;
                if (count === 0) return null;
                return (
                  <button key={type} onClick={() => toggleNodeType(type)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      active ? "bg-fp-blue/20 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-dim border border-fp-border"
                    }`}>
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {visibleNodes.length > 50 && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-fp-amber/10 border border-fp-amber/30 text-fp-amber text-xs">
                Showing {visibleNodes.length} nodes — use filters to narrow
              </div>
            )}
            <InvestigationGraph nodes={visibleNodes} edges={visibleEdges} selectedNode={selectedNode} highlightedNodes={highlightedNodes} onNodeClick={handleNodeClick} />
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <div className="h-64 shrink-0 border-t border-fp-border bg-fp-surface/60 backdrop-blur-xl overflow-hidden flex flex-col">
        <DetailPanel graph={graph} summary={summary} caseId={id} selectedNode={selectedNode} selectedEvent={timeline?.events.find(e => e.id === selectedEvent) ?? null} activeTab={activeDetailTab} onTabChange={setActiveDetailTab} />
      </div>
    </div>
  );
}
