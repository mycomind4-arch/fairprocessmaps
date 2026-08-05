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
  // Runs all 12 agents in parallel. For existing projects that already have
  // recon data, the endpoint returns immediately ("already completed").
  // To force re-run, the user can click the Refresh button.
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
      <header className="h-14 flex items-center px-4 gap-3 glass shrink-0 z-30 border-b border-fp-border">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2"
          title="Back to map"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Shield className="w-4 h-4 text-fp-cyan" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-fp-text truncate">{project?.name ?? "Loading…"}</div>
          <div className="text-[11px] text-fp-text-dim truncate">
            {project?.property.address} · APN {project?.property.apn}
          </div>
        </div>

        {/* Recon status indicator */}
        {recon && (
          <div className="flex items-center gap-2 text-xs">
            {recon.running ? (
              <div className="flex items-center gap-1.5 text-fp-cyan">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Recon running…</span>
              </div>
            ) : recon.failed > 0 ? (
              <div className="flex items-center gap-1.5 text-amber-400" title={recon.message}>
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{recon.succeeded}/{recon.agentCount} agents</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-400" title={recon.message}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Recon complete</span>
              </div>
            )}
            <button
              onClick={reRunRecon}
              disabled={recon.running}
              className="p-1 rounded text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 disabled:opacity-50"
              title="Re-run full recon"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recon.running ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}

        {project?.due_process_score != null && (
          <div className="text-xs font-medium text-fp-text-muted">
            Score <span className="text-fp-text">{project.due_process_score}</span>
          </div>
        )}
      </header>

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
