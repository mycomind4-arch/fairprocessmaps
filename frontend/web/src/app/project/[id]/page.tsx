"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectNav, { type ProjectSection } from "@/components/ProjectNav";
import MiniMap from "@/components/MiniMap";
import type { ProjectSummary } from "@/lib/types";
import type { CaseSummary, CaseGraph, CaseTimeline, TimelineEntry } from "@/lib/graph/types";
import OverviewPanel from "@/components/panels/OverviewPanel";
import PropertyIntelligence from "@/components/panels/PropertyIntelligence";
import EvidenceVaultPanel from "@/components/panels/EvidenceVaultPanel";
import DiscrepanciesPanel from "@/components/panels/DiscrepanciesPanel";
import TimelinePanel from "@/components/panels/TimelinePanel";
import LegalLibraryPanel from "@/components/panels/LegalLibraryPanel";
import ConnectorsPanel from "@/components/panels/ConnectorsPanel";
import AdminPanel from "@/components/panels/AdminPanel";
import CodeEnforcementPanel from "@/components/panels/CodeEnforcementPanel";
import BuildingDeptPanel from "@/components/panels/BuildingDeptPanel";
import InvestigationGraph from "@/components/InvestigationGraph";
import TimelineList from "@/components/TimelineList";
import DetailPanel from "@/components/DetailPanel";
import { ArrowLeft, Shield, Loader2, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Network, Clock, Filter, ChevronDown } from "lucide-react";

function toLngLat(point: { coordinates: [number, number] } | null | undefined) {
  return point ? { lng: point.coordinates[0], lat: point.coordinates[1] } : null;
}

interface ReconStatus {
  running: boolean;
  agentCount: number;
  succeeded: number;
  failed: number;
  noData: number;
  message: string;
  agents: { name: string; status: string; message: string }[];
}

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [section, setSection] = useState<ProjectSection>("overview");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [recon, setRecon] = useState<ReconStatus | null>(null);
  const [reconTriggered, setReconTriggered] = useState(false);

  // ── Graph section state (issue 1) ──
  const [graphData, setGraphData] = useState<CaseGraph | null>(null);
  const [graphSummary, setGraphSummary] = useState<CaseSummary | null>(null);
  const [graphTimeline, setGraphTimeline] = useState<CaseTimeline | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [activeDetailTab, setActiveDetailTab] = useState<"evidence" | "findings" | "authority" | "focus" | "agents">("evidence");
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set());

  // Fetch project summary — with fetchError state (issue 4)
  const fetchProject = useCallback(() => {
    setFetchError(null);
    fetch(`/api/v1/projects?id=${id}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load project (${r.status})`);
        return r.json();
      })
      .then((d: any) => {
        setProject(d as ProjectSummary);

        // ── Issue 3: Use server-side reconStatus to decide whether to auto-trigger ──
        if (d.reconCompleted && !reconTriggered) {
          setReconTriggered(true);
          setRecon({
            running: false,
            agentCount: 0,
            succeeded: 0,
            failed: 0,
            noData: 0,
            message: "Recon already completed — click refresh to re-run",
            agents: [],
          });
        }
      })
      .catch((err) => {
        setProject(null);
        setFetchError(err instanceof Error ? err.message : "Failed to load project");
      });
  }, [id, reconTriggered]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // ── Auto-trigger recon only if server says it hasn't run yet (issue 3) ──
  useEffect(() => {
    if (!id || reconTriggered) return;

    // Wait for project fetch to complete — if reconCompleted is true, fetchProject
    // already set reconTriggered. If it's false/null, trigger recon now.
    if (project && !project.reconCompleted) {
      setReconTriggered(true);

      setRecon({
        running: true,
        agentCount: 12,
        succeeded: 0,
        failed: 0,
        noData: 0,
        message: "Running property intelligence recon…",
        agents: [],
      });

      fetch(`/api/v1/intelligence/recon?projectId=${id}`, {
        method: "POST",
        headers: { "Cache-Control": "no-cache" },
      })
        .then((r) => r.json())
        .then((data: any) => {
          if (data.error) {
            setRecon({
              running: false,
              agentCount: 0,
              succeeded: 0,
              failed: 0,
              noData: 0,
              message: `Recon error: ${data.error}`,
              agents: [],
            });
            return;
          }

          const succeeded = data.succeeded ?? 0;
          const failed = data.failed ?? 0;
          const noData = data.noData ?? 0;
          const agentCount = data.agentCount ?? 12;
          const wasSkipped = data.agentCount > 0 && data.succeeded === 0 && data.intelligenceSummary?.includes("already completed");

          setRecon({
            running: false,
            agentCount,
            succeeded,
            failed,
            noData,
            message: wasSkipped
              ? "Recon already completed — click refresh to re-run"
              : `Recon complete: ${succeeded}/${agentCount} agents succeeded, ${failed} failed, ${noData} no data`,
            agents: data.results ?? [],
          });

          if (!wasSkipped) {
            setTimeout(() => fetchProject(), 1000);
          }
        })
        .catch((err) => {
          setRecon({
            running: false,
            agentCount: 0,
            succeeded: 0,
            failed: 0,
            noData: 0,
            message: `Recon failed: ${err.message}`,
            agents: [],
          });
        });
    }
  }, [id, project, reconTriggered, fetchProject]);

  // Force re-run recon
  const reRunRecon = useCallback(() => {
    setRecon({
      running: true,
      agentCount: 12,
      succeeded: 0,
      failed: 0,
      noData: 0,
      message: "Re-running full recon (forced)…",
      agents: [],
    });

    fetch(`/api/v1/intelligence/recon?projectId=${id}&force=true`, {
      method: "POST",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((r) => r.json())
      .then((data: any) => {
        setRecon({
          running: false,
          agentCount: data.agentCount ?? 12,
          succeeded: data.succeeded ?? 0,
          failed: data.failed ?? 0,
          noData: data.noData ?? 0,
          message: `Recon complete: ${data.succeeded ?? 0}/${data.agentCount ?? 12} agents succeeded`,
          agents: data.results ?? [],
        });
        setTimeout(() => fetchProject(), 1000);
      })
      .catch((err) => {
        setRecon({
          running: false,
          agentCount: 0,
          succeeded: 0,
          failed: 0,
          noData: 0,
          message: `Recon failed: ${err.message}`,
          agents: [],
        });
      });
  }, [id, fetchProject]);

  // ── Fetch graph/summary/timeline data when graph section is opened (issue 1) ──
  const fetchGraphData = useCallback(async () => {
    if (!id) return;
    setGraphLoading(true);
    setGraphError(null);
    try {
      const [summaryRes, graphRes, timelineRes] = await Promise.all([
        fetch(`/api/v1/cases/${id}/summary`).then(r => r.json() as any),
        fetch(`/api/v1/cases/${id}/graph`).then(r => r.json() as any),
        fetch(`/api/v1/cases/${id}/timeline`).then(r => r.json() as any),
      ]);
      if (summaryRes.ok) setGraphSummary(summaryRes.data);
      if (graphRes.ok) {
        setGraphData(graphRes.data);
        const types = new Set<string>(graphRes.data.nodes.map((n: { type: string }) => n.type));
        setVisibleNodeTypes(types);
      }
      if (timelineRes.ok) setGraphTimeline(timelineRes.data);
    } catch {
      setGraphError("Failed to load graph data. Please try again.");
    } finally {
      setGraphLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (section === "graph" && !graphData && !graphLoading) {
      fetchGraphData();
    }
  }, [section, graphData, graphLoading, fetchGraphData]);

  const handleEventClick = (entry: TimelineEntry) => {
    setSelectedEvent(entry.id);
    const nodes = new Set<string>();
    if (entry.evidence_id) nodes.add(entry.evidence_id);
    if (entry.entity_id) nodes.add(entry.entity_id);
    if (graphData) nodes.add(graphData.case.id);
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

  const visibleNodes = graphData?.nodes.filter(n => visibleNodeTypes.has(n.type)) ?? [];
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = graphData?.edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)) ?? [];

  // ── Issue 4: Distinct error view on fetch failure ──
  if (fetchError && !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fp-bg gap-4">
        <div className="w-12 h-12 rounded-xl bg-fp-red/15 border border-fp-red/30 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-fp-red" />
        </div>
        <h2 className="text-lg font-semibold text-fp-text">Couldn't load this project</h2>
        <p className="text-sm text-fp-text-muted max-w-md text-center">{fetchError}</p>
        <button
          onClick={() => {
            setFetchError(null);
            fetchProject();
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
      {/* ── Structured Header / Topbar ── */}
      <header className="glass shrink-0 z-30 border-b border-fp-border px-6 py-4 space-y-3">
        {/* Top Header Row: Navigation Back, Page Title, Location, Recon Status */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all shrink-0"
              title="Back to projects"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-fp-text truncate">
                {project?.property.address || project?.name || "Loading Property Matter…"}
              </h1>
              <p className="text-xs font-medium text-fp-text-dim uppercase tracking-wide flex items-center gap-2 mt-0.5">
                <span>{project?.status ? `${project.status} Investigation` : "Open Investigation"}</span>
                <span>·</span>
                <span>{project?.property.city || "County Jurisdiction"}</span>
                {project?.property.apn && (
                  <>
                    <span>·</span>
                    <span>APN {project.property.apn}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Recon status indicator */}
          <div className="flex items-center gap-4 shrink-0">
            {recon && (
              <div className="flex items-center gap-2 text-xs font-medium bg-fp-surface-2/80 px-3 py-1.5 rounded-xl border border-fp-border">
                {recon.running ? (
                  <div className="flex items-center gap-2 text-fp-blue">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="hidden sm:inline">Recon running…</span>
                  </div>
                ) : recon.failed > 0 ? (
                  <div className="flex items-center gap-2 text-fp-amber" title={recon.message}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{recon.succeeded}/{recon.agentCount} agents</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-fp-green" title={recon.message}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Recon complete</span>
                  </div>
                )}
                <button
                  onClick={reRunRecon}
                  disabled={recon.running}
                  className="p-1 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface transition-all disabled:opacity-50"
                  title="Re-run full recon"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recon.running ? "animate-spin" : ""}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Divider */}
        <div className="border-t border-fp-border" />

        {/* Row of Compact Stat Readouts */}
        <div className="flex items-center gap-8 text-xs overflow-x-auto py-0.5">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Evidence Count:</span>
            <span className="font-semibold text-fp-text text-sm">{project?.evidenceCount ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Timeline Events:</span>
            <span className="font-semibold text-fp-text text-sm">{project?.evidenceCount ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Findings Count:</span>
            <span className="font-semibold text-fp-text text-sm">{project?.openFindingsCount ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Pending Reviews:</span>
            <span className="font-semibold text-fp-red text-sm">{project?.criticalFindingsCount ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Risk Level:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                project?.due_process_score == null
                  ? "bg-fp-surface-2 text-fp-text-dim"
                  : project.due_process_score < 60
                  ? "bg-fp-red/20 text-fp-red border border-fp-red/30"
                  : project.due_process_score < 80
                  ? "bg-fp-amber/20 text-fp-amber border border-fp-amber/30"
                  : "bg-fp-green/20 text-fp-green border border-fp-green/30"
              }`}
            >
              {project?.due_process_score == null
                ? "Unassessed"
                : project.due_process_score < 60
                ? "High Risk"
                : project.due_process_score < 80
                ? "Moderate Risk"
                : "Low Risk"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Layout Body ── */}
      <div className="flex-1 flex overflow-hidden relative">
        <ProjectNav
          active={section}
          onSelect={setSection}
          criticalFindingsCount={project?.criticalFindingsCount ?? 0}
        />

        <main className="flex-1 relative overflow-y-auto p-6">
          {/* MiniMap floats in top-right for sections that need spatial context */}
          {project?.property.centroid && section !== "vault" && section !== "admin" && section !== "connectors" && section !== "legal" && section !== "code-enforcement" && section !== "building" && section !== "timeline" && section !== "graph" && (
            <MiniMap
              centroid={toLngLat(project.property.centroid)!}
              geomGeoJSON={(project.property.geom as any) ?? undefined}
              onExpand={() => setMapExpanded(true)}
            />
          )}

          {section === "overview" && <OverviewPanel projectId={id} onNavigate={setSection} />}
          {section === "intelligence" && <PropertyIntelligence propertyId={project?.property_id ?? ""} />}
          {section === "timeline" && <TimelinePanel projectId={id} />}
          {section === "building" && <BuildingDeptPanel projectId={id} />}
          {section === "code-enforcement" && <CodeEnforcementPanel projectId={id} />}
          {section === "discrepancies" && <DiscrepanciesPanel projectId={id} />}
          {section === "vault" && <EvidenceVaultPanel projectId={id} />}
          {section === "legal" && <LegalLibraryPanel />}
          {section === "connectors" && <ConnectorsPanel projectId={id} />}
          {section === "admin" && <AdminPanel projectId={id} />}

          {/* ── Graph section (issue 1) ── */}
          {section === "graph" && (
            <div className="h-full flex flex-col -m-6">
              {graphLoading && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-fp-blue" />
                </div>
              )}
              {graphError && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <AlertCircle className="w-6 h-6 text-fp-red" />
                  <p className="text-sm text-fp-text-muted">{graphError}</p>
                  <button
                    onClick={fetchGraphData}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                </div>
              )}
              {!graphLoading && !graphError && (
                <>
                  {/* Graph toolbar */}
                  <div className="shrink-0 px-6 py-3 border-b border-fp-border bg-fp-surface/40 flex items-center gap-3">
                    <Network className="w-4 h-4 text-fp-text-dim" />
                    <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Relationship Graph</h2>
                    <div className="ml-auto flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-fp-text-dim" />
                      {["property", "case", "evidence", "finding", "permit", "ce_case", "event"].map(type => {
                        const active = visibleNodeTypes.has(type);
                        const count = graphData?.nodes.filter(n => n.type === type).length ?? 0;
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
                      <a
                        href={`/investigation/${id}`}
                        onClick={(e) => { e.preventDefault(); router.push(`/investigation/${id}`); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-surface-2/80 text-xs font-medium text-fp-text-muted hover:text-fp-text transition-colors"
                        title="Open fullscreen graph view"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Fullscreen
                      </a>
                    </div>
                  </div>

                  {/* Main: Timeline (narrow) | Graph (hero) */}
                  <div className="flex-1 flex min-h-0">
                    {/* Timeline — narrower supporting column */}
                    <div className="w-72 shrink-0 border-r border-fp-border bg-fp-surface/40 overflow-hidden flex flex-col">
                      <div className="shrink-0 px-6 py-4 border-b border-fp-border/50 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-fp-text-dim" />
                        <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Timeline</h2>
                        <span className="ml-auto text-xs text-fp-text-dim">{graphTimeline?.events.length ?? 0}</span>
                      </div>
                      <TimelineList events={graphTimeline?.events ?? []} selectedEvent={selectedEvent} onEventClick={handleEventClick} />
                    </div>

                    {/* Graph — hero content */}
                    <div className="flex-1 min-w-0 relative overflow-hidden flex flex-col">
                      <div className="flex-1 min-h-0">
                        {visibleNodes.length > 50 && (
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-fp-amber/10 border border-fp-amber/30 text-fp-amber text-xs">
                            Showing {visibleNodes.length} nodes — use filters to narrow
                          </div>
                        )}
                        {graphData ? (
                          <InvestigationGraph nodes={visibleNodes} edges={visibleEdges} selectedNode={selectedNode} highlightedNodes={highlightedNodes} onNodeClick={handleNodeClick} />
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-sm text-fp-text-muted">
                            No graph data available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detail Panel — collapsible */}
                  <div className={`shrink-0 border-t border-fp-border bg-fp-surface/60 backdrop-blur-xl overflow-hidden flex flex-col transition-all duration-200 ${detailExpanded ? "h-72" : "h-12"}`}>
                    <button
                      onClick={() => setDetailExpanded(!detailExpanded)}
                      className="shrink-0 flex items-center gap-2 px-6 py-3 w-full hover:bg-fp-surface-2/40 transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 text-fp-text-dim transition-transform duration-200 ${detailExpanded ? "" : "rotate-180"}`} />
                      <span className="text-xs font-semibold text-fp-text-muted uppercase tracking-wide">Details</span>
                      {selectedNode && (
                        <span className="text-xs text-fp-blue ml-2">Node selected</span>
                      )}
                    </button>
                    {detailExpanded && graphData && graphSummary && (
                      <div className="flex-1 overflow-hidden">
                        <DetailPanel graph={graphData} summary={graphSummary} caseId={id} selectedNode={selectedNode} selectedEvent={graphTimeline?.events.find(e => e.id === selectedEvent) ?? null} activeTab={activeDetailTab} onTabChange={setActiveDetailTab} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {mapExpanded && (
        <div
          className="fixed inset-0 z-40 bg-fp-bg/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setMapExpanded(false)}
        >
          <div className="text-fp-text-muted text-sm">
            Swap in the full PropertyMap component here, centered on this project&apos;s parcel.
          </div>
        </div>
      )}
    </div>
  );
}
