"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectNav, { type ProjectSection } from "@/components/ProjectNav";
import MiniMap from "@/components/MiniMap";
import type { ProjectSummary } from "@/lib/types";
import OverviewPanel from "@/components/panels/OverviewPanel";
import PropertyIntelligence from "@/components/panels/PropertyIntelligence";
import EvidenceVaultPanel from "@/components/panels/EvidenceVaultPanel";
import DiscrepanciesPanel from "@/components/panels/DiscrepanciesPanel";
import TimelinePanel from "@/components/panels/TimelinePanel";
import PlaceholderPanel from "@/components/panels/PlaceholderPanel";
import LegalLibraryPanel from "@/components/panels/LegalLibraryPanel";
import CodeEnforcementPanel from "@/components/panels/CodeEnforcementPanel";
import { ArrowLeft, Shield, Building2, ShieldAlert, BookOpen, Plug, Settings } from "lucide-react";

function toLngLat(point: { coordinates: [number, number] } | null | undefined) {
  return point ? { lng: point.coordinates[0], lat: point.coordinates[1] } : null;
}

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [section, setSection] = useState<ProjectSection>("overview");
  const [mapExpanded, setMapExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/projects?id=${id}`, { headers: { "Cache-Control": "no-cache" } })
      .then((r) => r.json())
      .then((d) => setProject(d as ProjectSummary))
      .catch(() => setProject(null));
  }, [id]);

  return (
    <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
      <header className="h-14 flex items-center px-4 gap-3 glass shrink-0 z-30 border-b border-fp-border">
        <button
          onClick={() => router.push("/")}
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
          {project?.property.centroid && section !== "vault" && section !== "admin" && section !== "connectors" && section !== "legal" && section !== "code-enforcement" && (
            <MiniMap
              centroid={toLngLat(project.property.centroid)!}
              geomGeoJSON={(project.property.geom as GeoJSON.Geometry) ?? undefined}
              onExpand={() => setMapExpanded(true)}
            />
          )}

          {section === "overview" && <OverviewPanel projectId={id} onNavigate={setSection} />}
          {section === "intelligence" && <PropertyIntelligence propertyId={project?.property_id ?? ""} />}
          {section === "building" && (
            <PlaceholderPanel
              icon={Building2}
              title="Building Dept"
              description="Permit applications, inspections, and certificates of occupancy"
            />
          )}
          {section === "code-enforcement" && <CodeEnforcementPanel projectId={id} />}
          {section === "discrepancies" && <DiscrepanciesPanel projectId={id} />}
          {section === "vault" && <EvidenceVaultPanel projectId={id} />}
          {section === "legal" && <LegalLibraryPanel />}
          {section === "connectors" && (
            <PlaceholderPanel
              icon={Plug}
              title="Connectors & Skills"
              description="County data integrations, scraping pipelines, and AI analysis tools"
            />
          )}
          {section === "admin" && (
            <PlaceholderPanel
              icon={Settings}
              title="Admin"
              description="Project settings, user management, and system configuration"
            />
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
