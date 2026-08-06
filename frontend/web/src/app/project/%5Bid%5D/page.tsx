"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectNav, { type ProjectSection } from "@/components/ProjectNav";
import MiniMap from "@/components/MiniMap";
import type { ProjectSummary } from "@/lib/types";
import OverviewPanel from "@/components/panels/OverviewPanel";
import PropertyIntelligence from "@/components/panels/PropertyIntelligence";
import EvidenceVaultPanel from "@/components/panels/EvidenceVaultPanel";
import DiscrepanciesPanel from "@/components/panels/DiscrepanciesPanel";
import TimelinePanel from "@/components/panels/TimelinePanel";
import LegalLibraryPanel from "@/components/panels/LegalLibraryPanel";
import { BriefGeneratorPanel } from "@/components/panels/BriefGeneratorPanel";
import ConnectorsPanel from "@/components/panels/ConnectorsPanel";
import AdminPanel from "@/components/panels/AdminPanel";
import CodeEnforcementPanel from "@/components/panels/CodeEnforcementPanel";
import BuildingDeptPanel from "@/components/panels/BuildingDeptPanel";
import { ArrowLeft, Shield, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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
  const [section, setSection] = useState<ProjectSection>("overview");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [recon, setRecon] = useState<ReconStatus | null>(null);
  const [reconTriggered, setReconTriggered] = useState(false);

  // Fetch project summary
  const fetchProject = useCallback(() => {
    fetch(`/api/v1/projects?id=${id}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => r.json())
      .then((d) => setProject(d as ProjectSummary))
      .catch(() => setProject(null));
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // ── Auto-trigger full property intelligence recon on project open ──
  useEffect(() => {
    if (!id || reconTriggered) return;
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

        // Refresh project data to pick up any new evidence/findings/score
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
  }, [id, reconTriggered, fetchProject]);

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
          {project?.property.centroid && section !== "vault" && section !== "admin" && section !== "connectors" && section !== "legal" && section !== "code-enforcement" && section !== "building" && section !== "timeline" && (
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
          {section === "briefs" && <BriefGeneratorPanel projectId={id} />}
          {section === "connectors" && <ConnectorsPanel projectId={id} />}
          {section === "admin" && <AdminPanel projectId={id} />}
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

