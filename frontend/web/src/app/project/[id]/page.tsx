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
import { ArrowLeft, Shield, Loader2, CheckCircle2, AlertCircle, RefreshCw, FileText, Clock, Scale, AlertTriangle } from "lucide-react";

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

  const fetchProject = useCallback(() => {
    fetch(`/api/v1/projects?id=${id}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => r.json())
      .then((d) => setProject(d as ProjectSummary))
      .catch(() => setProject(null));
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

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

  const noMapSections = ["vault", "admin", "connectors", "legal", "code-enforcement", "building", "timeline"];

  return (
    <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
      {/* ── Header: Case info bar ── */}
      <header className="shrink-0 border-b border-fp-border bg-fp-surface/40 backdrop-blur-xl">
        <div className="flex items-center gap-4 px-6 py-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 -ml-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fp-blue/80 to-fp-cyan/80 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-fp-text leading-tight tracking-tight">
                {project?.property.address ?? "Loading…"}
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-fp-text-dim mt-0.5">
                <span className="capitalize font-medium text-fp-amber">Open Investigation</span>
                <span className="text-fp-border-hover">·</span>
                <span>{project?.property.city ?? "Humboldt County"}</span>
                <span className="text-fp-border-hover">·</span>
                <span className="font-mono">APN {project?.property.apn ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {recon && (
              <div className="flex items-center gap-2 text-xs mr-2">
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
                  className="p-1 rounded text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 disabled:opacity-50 transition-colors"
                  title="Re-run full recon"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recon.running ? "animate-spin" : ""}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Metrics strip ── */}
        <div className="flex items-center gap-6 px-6 py-2.5 border-t border-fp-border/50 text-xs">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-fp-text-dim" />
            <span className="text-fp-text-muted">Evidence</span>
            <span className="font-semibold text-fp-text">{project?.evidenceCount ?? 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-fp-text-dim" />
            <span className="text-fp-text-muted">Timeline</span>
            <span className="font-semibold text-fp-text">{project?.openFindingsCount ?? 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Scale className="w-3 h-3 text-fp-text-dim" />
            <span className="text-fp-text-muted">Findings</span>
            <span className="font-semibold text-fp-text">{project?.openFindingsCount ?? 0}</span>
          </span>
          {(project?.criticalFindingsCount ?? 0) > 0 && (
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-fp-red" />
              <span className="text-fp-text-muted">Critical</span>
              <span className="font-semibold text-fp-red">{project?.criticalFindingsCount}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-fp-text-muted">Risk</span>
            <span className={`font-semibold ${(project?.criticalFindingsCount ?? 0) > 0 ? "text-fp-red" : "text-fp-amber"}`}>
              {(project?.criticalFindingsCount ?? 0) > 0 ? "HIGH" : "MODERATE"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <ProjectNav
          active={section}
          onSelect={setSection}
          criticalFindingsCount={project?.criticalFindingsCount ?? 0}
        />

        <main className="flex-1 relative overflow-y-auto p-8">
          {project?.property.centroid && !noMapSections.includes(section) && (
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
