"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const PropertyMap = dynamic(() => import("@/components/PropertyMap"), { ssr: false });
import ProjectNav, { type ProjectSection } from "@/components/ProjectNav";
import MiniMap from "@/components/MiniMap";
import type { ProjectSummary } from "@/lib/types";
import PropertyIntelligence from "@/components/panels/PropertyIntelligence";
import EvidenceVaultPanel from "@/components/panels/EvidenceVaultPanel";
import TimelinePanel from "@/components/panels/TimelinePanel";
import AnalysisPanel from "@/components/panels/AnalysisPanel";
import LegalToolsPanel from "@/components/panels/LegalToolsPanel";
import CaseGraphPanel from "@/components/panels/CaseGraphPanel";
import ConnectorsPanel from "@/components/panels/ConnectorsPanel";
import AdminPanel from "@/components/panels/AdminPanel";
import AuthorityEnforcementPanel from "@/components/panels/AuthorityEnforcementPanel";
import { useReconStream, TopProgressBar, AgentPopup } from "@/components/ReconProgressModal";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, RefreshCw, X, Menu } from "lucide-react";

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

function ProjectRecon({ projectId, force, onComplete, onClose }: {
  projectId: string;
  force: boolean;
  onComplete?: (r: any) => void;
  onClose?: () => void;
}) {
  const { state, start } = useReconStream(projectId, force, onComplete);
  const [popupMinimized, setPopupMinimized] = useState(false);

  useEffect(() => { start(); /* eslint-disable-next-line */ }, []);

  return (
    <>
      <TopProgressBar state={state} />
      <AgentPopup
        state={state}
        onClose={onClose || (() => {})}
        onMinimize={() => setPopupMinimized(!popupMinimized)}
        minimized={popupMinimized}
      />
    </>
  );
}

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [section, setSection] = useState<ProjectSection>("intelligence");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recon, setRecon] = useState<ReconStatus | null>(null);
  const [reconTriggered, setReconTriggered] = useState(false);
  const [showReconModal, setShowReconModal] = useState(false);
  const [reconForce, setReconForce] = useState(false);

  const fetchProject = useCallback(() => {
    setFetchError(null);
    // Case is now the source of truth. The adapter accepts this legacy
    // project ID during migration and resolves it through case_projects.
    fetch(`/api/v1/cases/${id}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load case (${r.status})`);
        return r.json();
      })
      .then((d: any) => {
        setProject(d as ProjectSummary);
        if (d.reconCompleted && !reconTriggered) {
          setReconTriggered(true);
          setRecon({
            running: false, agentCount: 0, succeeded: 0, failed: 0, noData: 0,
            message: "Recon already completed — click refresh to re-run",
            agents: [],
          });
        }
      })
      .catch((err) => {
        setProject(null);
        setFetchError(err instanceof Error ? err.message : "Failed to load case");
      });
  }, [id, reconTriggered]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    const handler = () => {
      setReconForce(true);
      setShowReconModal(true);
    };
    window.addEventListener("trigger-recon", handler);
    return () => window.removeEventListener("trigger-recon", handler);
  }, []);

  useEffect(() => {
    if (!id || reconTriggered) return;
    if (project && !project.reconCompleted) {
      setReconTriggered(true);
      setReconForce(false);
      setShowReconModal(true);
    }
  }, [id, project, reconTriggered]);

  const reRunRecon = useCallback(() => {
    setReconForce(true);
    setShowReconModal(true);
  }, []);

  if (fetchError && !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-8 h-8 text-fp-red" />
        <p className="text-sm text-fp-text-muted">{fetchError}</p>
        <button onClick={fetchProject} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-fp-blue" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-fp-bg">
      <header className="shrink-0 border-b border-fp-border bg-fp-surface/60 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileNavOpen(true)} className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all shrink-0 lg:hidden" title="Navigation" aria-label="Open navigation">
              <Menu className="w-5 h-5" />
            </button>
            <button onClick={() => router.push("/dashboard")} className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all shrink-0" title="Back to cases">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-fp-text truncate">
                {project?.property.address || project?.name || "Loading Matter…"}
              </h1>
              <p className="text-xs font-medium text-fp-text-dim uppercase tracking-wide flex items-center gap-2 mt-0.5">
                <span>{project?.status ? `${project.status} Investigation` : "Open Investigation"}</span>
                <span>·</span>
                <span>{project?.property.city || "County Jurisdiction"}</span>
                {project?.property.apn && (<><span>·</span><span>APN {project.property.apn}</span></>)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {recon && (
              <div className="flex items-center gap-2 text-xs font-medium bg-fp-surface-2/80 px-3 py-1.5 rounded-xl border border-fp-border">
                {recon.running ? (
                  <div className="flex items-center gap-2 text-fp-blue"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Recon running…</span></div>
                ) : recon.failed > 0 ? (
                  <div className="flex items-center gap-2 text-fp-amber" title={recon.message}><AlertCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">{recon.succeeded}/{recon.agentCount} agents</span></div>
                ) : (
                  <div className="flex items-center gap-2 text-fp-green" title={recon.message}><CheckCircle2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Recon complete</span></div>
                )}
                <button onClick={reRunRecon} disabled={recon.running} className="p-1 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface transition-all disabled:opacity-50" title="Re-run full recon">
                  <RefreshCw className={`w-3.5 h-3.5 ${recon.running ? "animate-spin" : ""}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-fp-border" />

        <div className="flex items-center gap-4 sm:gap-8 text-xs overflow-x-auto py-0.5 px-4 sm:px-6 scrollbar-thin">
          <div className="flex items-center gap-2 shrink-0"><span className="text-fp-text-dim uppercase tracking-wide font-medium">Evidence:</span><span className="font-semibold text-fp-text text-sm">{project?.evidenceCount ?? 0}</span></div>
          <div className="flex items-center gap-2 shrink-0"><span className="text-fp-text-dim uppercase tracking-wide font-medium">Timeline:</span><span className="font-semibold text-fp-text text-sm">{project?.timelineCount ?? 0}</span></div>
          <div className="flex items-center gap-2 shrink-0"><span className="text-fp-text-dim uppercase tracking-wide font-medium">Findings:</span><span className="font-semibold text-fp-text text-sm">{project?.openFindingsCount ?? 0}</span></div>
          <div className="flex items-center gap-2 shrink-0"><span className="text-fp-text-dim uppercase tracking-wide font-medium">Pending Reviews:</span><span className="font-semibold text-fp-red text-sm">{project?.criticalFindingsCount ?? 0}</span></div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-fp-text-dim uppercase tracking-wide font-medium">Risk:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${project?.due_process_score == null ? "bg-fp-surface-2 text-fp-text-dim" : project.due_process_score < 60 ? "bg-fp-red/20 text-fp-red border border-fp-red/30" : project.due_process_score < 80 ? "bg-fp-amber/20 text-fp-amber border border-fp-amber/30" : "bg-fp-green/20 text-fp-green border border-fp-green/30"}`}>
              {project?.due_process_score == null ? "Unassessed" : project.due_process_score < 60 ? "High Risk" : project.due_process_score < 80 ? "Moderate Risk" : "Low Risk"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="hidden lg:block">
          <ProjectNav active={section} onSelect={setSection} criticalFindingsCount={project?.criticalFindingsCount ?? 0} />
        </div>

        {mobileNavOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-fp-bg/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />
            <div className="fixed left-0 top-0 bottom-0 z-50 lg:hidden animate-[slide-right_0.2s_ease-out]">
              <ProjectNav active={section} onSelect={(s) => { setSection(s); setMobileNavOpen(false); }} criticalFindingsCount={project?.criticalFindingsCount ?? 0} />
            </div>
          </>
        )}

        <main className="flex-1 relative overflow-y-auto p-3 sm:p-6">
          {project?.property.centroid && section === "intelligence" && (
            <MiniMap centroid={toLngLat(project.property.centroid)!} geomGeoJSON={(project.property.geom as any) ?? undefined} onExpand={() => setMapExpanded(true)} />
          )}

          {section === "intelligence" && <PropertyIntelligence projectId={id} propertyId={project?.property_id ?? ""} onNavigate={setSection} />}
          {section === "authority" && <AuthorityEnforcementPanel projectId={id} />}
          {section === "timeline" && <TimelinePanel projectId={id} />}
          {section === "vault" && <EvidenceVaultPanel projectId={id} />}
          {section === "analysis" && <AnalysisPanel projectId={id} />}
          {section === "legal" && <LegalToolsPanel projectId={id} />}
          {section === "graph" && <CaseGraphPanel projectId={id} />}
          {section === "connectors" && <ConnectorsPanel projectId={id} />}
          {section === "admin" && <AdminPanel projectId={id} />}
        </main>
      </div>

      {mapExpanded && (
        <div className="fixed inset-0 z-50 bg-fp-bg/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border shrink-0">
            <h2 className="text-lg font-semibold text-fp-text">{project?.property.address || "Property Map"}</h2>
            <button onClick={() => setMapExpanded(false)} className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all" title="Close map"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 relative">
            <PropertyMap initialCenter={project?.property.centroid ? [project.property.centroid.coordinates[0], project.property.centroid.coordinates[1]] : undefined} initialZoom={16} onSelectProperty={() => {}} selectedProperty={null} />
          </div>
        </div>
      )}

      {showReconModal && (
        <ProjectRecon
          projectId={id}
          force={reconForce}
          onComplete={(result) => { setRecon(result ? { running: false, agentCount: result.total, succeeded: result.succeeded, failed: result.failed, noData: result.noData, message: `Recon complete: ${result.succeeded}/${result.total} agents succeeded`, agents: [] } : null); fetchProject(); }}
          onClose={() => setShowReconModal(false)}
        />
      )}
    </div>
  );
}
