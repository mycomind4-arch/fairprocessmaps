"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { CaseSummary, CaseGraph, CaseTimeline, TimelineEntry } from "@/lib/graph/types";
import { ArrowLeft, Shield, Loader2, AlertTriangle, Clock, MapPin, FileText, Scale, Network, ChevronRight, Filter, Bot, ChevronDown, AlertCircle, RefreshCw, LayoutDashboard } from "lucide-react";
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(true);

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
    setFetchError(null);
    const errors: string[] = [];
    try {
      const [summaryRes, graphRes, timelineRes] = await Promise.all([
        fetch(`/api/v1/cases/${id}/summary`).then(r => r.json() as any),
        fetch(`/api/v1/cases/${id}/graph`).then(r => r.json() as any),
        fetch(`/api/v1/cases/${id}/timeline`).then(r => r.json() as any),
      ]);
      
      if (summaryRes.ok) {
        setSummary(summaryRes.data);
      } else {
        errors.push(summaryRes.error || "Failed to load case summary");
      }
      
      if (graphRes.ok) {
        setGraph(graphRes.data);
        const types = new Set<string>(graphRes.data.nodes.map((n: { type: string }) => n.type));
        setVisibleNodeTypes(types);
      } else {
        errors.push(graphRes.error || "Failed to load case graph");
      }
      
      if (timelineRes.ok) {
        setTimeline(timelineRes.data);
      } else {
        errors.push(timelineRes.error || "Failed to load case timeline");
      }

      // If all three failed, show the error view
      if (errors.length === 3) {
        setFetchError(errors[0]);
      } else if (errors.length > 0) {
        // Partial failure — show what we have, but surface the error
        console.warn("[investigation] Partial data load errors:", errors);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load case data.");
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
      <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
        {/* Skeleton header */}
        <div className="shrink-0 border-b border-fp-border bg-fp-surface/60 animate-pulse">
          <div className="flex items-center gap-4 px-8 py-4">
            <div className="w-10 h-10 rounded-[14px] bg-fp-surface-2" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-fp-surface-2 rounded" />
              <div className="h-3 w-32 bg-fp-surface-2 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-4 sm:p-6 px-8 py-3 border-t border-fp-border/50">
            <div className="h-3 w-20 bg-fp-surface-2 rounded" />
            <div className="h-3 w-24 bg-fp-surface-2 rounded" />
            <div className="h-3 w-16 bg-fp-surface-2 rounded" />
          </div>
        </div>
        {/* Skeleton body */}
        <div className="flex-1 flex min-h-0">
          <div className="w-72 shrink-0 border-r border-fp-border bg-fp-surface/40 animate-pulse p-4 sm:p-6 space-y-3">
            {[0,1,2,3].map(i => <div key={i} className="h-12 bg-fp-surface-2 rounded-lg" />)}
          </div>
          <div className="flex-1 animate-pulse flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-fp-blue" />
            <span className="ml-3 text-sm text-fp-text-dim">Loading graph data…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Issue 4: Distinct error view vs. "not found" ──
  if (fetchError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fp-bg gap-4">
        <div className="w-12 h-12 rounded-xl bg-fp-red/15 border border-fp-red/30 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-fp-red" />
        </div>
        <h2 className="text-lg font-semibold text-fp-text">Couldn't load this case</h2>
        <p className="text-sm text-fp-text-muted max-w-md text-center">{fetchError}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fp-bg gap-4">
        <Scale className="w-8 h-8 text-fp-text-dim" />
        <p className="text-sm text-fp-text-muted">Case not found</p>
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
      {/* ── Case Header ── */}
      <header className="shrink-0 border-b border-fp-border bg-fp-surface/60 backdrop-blur-xl">
        <div className="flex items-center gap-4 px-8 py-4">
          <button onClick={() => router.push("/dashboard")} className="text-fp-text-dim hover:text-fp-text transition-colors shrink-0" title="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => router.push(`/project/${id}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-surface-2/80 text-xs font-medium text-fp-text-muted hover:text-fp-text transition-colors shrink-0"
            title="Back to project workspace"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Workspace
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fp-text leading-tight">{summary.case_name}</h1>
              <div className="flex items-center gap-3 text-sm text-fp-text-dim mt-1">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {summary.property.address || summary.property.apn}
                </span>
                <span>·</span>
                <span>{summary.jurisdiction}</span>
                <span>·</span>
                <span className={summary.status === "open" ? "text-fp-amber" : "text-fp-green"}>{summary.status}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {summary.risk_indicators.map((risk, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                risk.severity === "critical" ? "border-fp-red/30 bg-fp-red/10 text-fp-red" :
                risk.severity === "warning" ? "border-fp-amber/30 bg-fp-amber/10 text-fp-amber" :
                "border-fp-green/30 bg-fp-green/10 text-fp-green"
              }`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {risk.label}
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 sm:p-6 px-8 py-3 border-t border-fp-border/50 text-sm text-fp-text-dim">
          <span className="flex items-center gap-2"><FileText className="w-4 h-4" />{summary.evidence_count} Evidence</span>
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{summary.open_findings_count} Open Findings{summary.critical_findings_count > 0 && <span className="text-fp-red ml-1">({summary.critical_findings_count} critical)</span>}</span>
          <span className="flex items-center gap-2"><Clock className="w-4 h-4" />{summary.timeline_event_count} Events</span>
          {summary.last_action.date && (
            <span className="flex items-center gap-2 ml-auto">Last: {summary.last_action.type_label || summary.last_action.type} <span className="text-fp-text-muted">{summary.last_action.date}</span></span>
          )}
        </div>
      </header>

      {/* ── Main: Timeline (narrow) | Graph (hero) ── */}
      <div className="flex-1 flex min-h-0">
        {/* Timeline — narrower supporting column */}
        <div className="w-72 shrink-0 border-r border-fp-border bg-fp-surface/40 overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-fp-border/50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-fp-text-dim" />
            <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Timeline</h2>
            <span className="ml-auto text-xs text-fp-text-dim">{timeline?.events.length ?? 0}</span>
          </div>
          <TimelineList events={timeline?.events ?? []} selectedEvent={selectedEvent} onEventClick={handleEventClick} />
        </div>

        {/* Graph — hero content, dominant space */}
        <div className="flex-1 min-w-0 relative overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-fp-border/50 flex items-center gap-2">
            <Network className="w-4 h-4 text-fp-text-dim" />
            <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Relationship Graph</h2>

            <div className="ml-auto flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-fp-text-dim" />
              {["property", "case", "evidence", "finding", "permit", "ce_case", "event"].map(type => {
                const active = visibleNodeTypes.has(type);
                const count = graph?.nodes.filter(n => n.type === type).length ?? 0;
                if (count === 0) return null;
                return (
                  <button key={type} onClick={() => toggleNodeType(type)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
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
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-fp-amber/10 border border-fp-amber/30 text-fp-amber text-xs">
                Showing {visibleNodes.length} nodes — use filters to narrow
              </div>
            )}
            <InvestigationGraph nodes={visibleNodes} edges={visibleEdges} selectedNode={selectedNode} highlightedNodes={highlightedNodes} onNodeClick={handleNodeClick} />
            {/* Graph Legend */}
            {graph && visibleNodes.length > 0 && (
              <div className="absolute bottom-3 left-3 z-10 px-4 py-3 rounded-xl glass border border-fp-border/60 shadow-lg space-y-1.5 text-xs">
                <div className="font-semibold text-fp-text-muted uppercase tracking-wide text-[10px] mb-1">Legend</div>
                {[
                  { type: "case", color: "bg-fp-blue", label: "Case" },
                  { type: "property", color: "bg-fp-green", label: "Property" },
                  { type: "evidence", color: "bg-fp-amber", label: "Evidence" },
                  { type: "finding", color: "bg-fp-red", label: "Finding" },
                  { type: "event", color: "bg-fp-cyan", label: "Event" },
                  { type: "permit", color: "bg-fp-purple", label: "Permit" },
                  { type: "ce_case", color: "bg-fp-pink", label: "CE Case" },
                ].map(({ type, color, label }) => {
                  const count = graph.nodes.filter(n => n.type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${color}`} />
                      <span className="text-fp-text-dim">{label}</span>
                      <span className="text-fp-text-muted ml-auto text-[10px]">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail Panel — collapsible ── */}
      <div className={`shrink-0 border-t border-fp-border bg-fp-surface/60 backdrop-blur-xl overflow-hidden flex flex-col transition-all duration-200 ${detailExpanded ? "h-72" : "h-12"}`}>
        <button
          onClick={() => setDetailExpanded(!detailExpanded)}
          className="shrink-0 flex items-center gap-2 px-4 sm:px-6 py-3 w-full hover:bg-fp-surface-2/40 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 text-fp-text-dim transition-transform duration-200 ${detailExpanded ? "" : "rotate-180"}`} />
          <span className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Details</span>
          {selectedNode && (
            <span className="text-xs text-fp-blue ml-2">Node selected</span>
          )}
        </button>
        {detailExpanded && (
          <div className="flex-1 overflow-hidden">
            <DetailPanel graph={graph} summary={summary} caseId={id} selectedNode={selectedNode} selectedEvent={timeline?.events.find(e => e.id === selectedEvent) ?? null} activeTab={activeDetailTab} onTabChange={setActiveDetailTab} />
          </div>
        )}
      </div>
    </div>
  );
}
