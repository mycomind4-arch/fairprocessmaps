"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectNav, { type ProjectSection } from "@/components/ProjectNav";
import MiniMap from "@/components/MiniMap";
import type { ProjectSummary } from "@/lib/types";

function toLngLat(point: { coordinates: [number, number] } | null | undefined) {
  return point ? { lng: point.coordinates[0], lat: point.coordinates[1] } : null;
}
import { ArrowLeft, Shield } from "lucide-react";

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
          {project?.property.centroid && (
            <MiniMap
              centroid={toLngLat(project.property.centroid)!}
              geomGeoJSON={(project.property.geom as GeoJSON.Geometry) ?? undefined}
              onExpand={() => setMapExpanded(true)}
            />
          )}

          {/* Each section below is a placeholder — swap in the existing
              EvidencePanel / TimelinePanel / DocumentUpload components,
              scoped to this project's id instead of a bare property id. */}
          {section === "overview" && <div className="text-fp-text-muted text-sm">Overview — summary + correspondence feed</div>}
          {section === "intelligence" && <div className="text-fp-text-muted text-sm">Property Intelligence — AI-scraped public data</div>}
          {section === "building" && <div className="text-fp-text-muted text-sm">Building Dept records</div>}
          {section === "code-enforcement" && <div className="text-fp-text-muted text-sm">Code Enforcement records</div>}
          {section === "discrepancies" && <div className="text-fp-text-muted text-sm">Due process discrepancies found by AI</div>}
          {section === "vault" && <div className="text-fp-text-muted text-sm">Document vault</div>}
          {section === "legal" && <div className="text-fp-text-muted text-sm">Legal resources & law library</div>}
          {section === "connectors" && <div className="text-fp-text-muted text-sm">Connectors, plugins & skills</div>}
          {section === "admin" && <div className="text-fp-text-muted text-sm">Admin control panel</div>}
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
