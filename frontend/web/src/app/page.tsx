"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import NewProjectModal from "@/components/NewProjectModal";
import { PanelRightOpen, PanelRight, Shield, MapPin, Building2, Ruler, FileText, ChevronRight, FolderOpen } from "lucide-react";

interface PendingParcel {
  apn: string;
  address: string;
  city: string;
  acres: number;
  zoning: string;
  legal: string;
}

interface PropertyInfo {
  id: string;
  apn: string;
  address: string;
  city: string;
  zoning: string | null;
  acres: number | null;
  legal_desc: string | null;
  projectCount: number;
  evidenceCount: number;
  timelineCount: number;
}

const PropertyMap = dynamic(() => import("@/components/PropertyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-fp-bg">
      <div className="shimmer w-full h-full rounded-lg" />
    </div>
  ),
});

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingParcel, setPendingParcel] = useState<PendingParcel | null>(null);
  const [pendingPropertyId, setPendingPropertyId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyInfo | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  // Load property details when a property is selected from search or map
  const loadProperty = useCallback(async (propertyId: string) => {
    setPropertyLoading(true);
    try {
      const res = await fetch(`/api/v1/properties?id=${propertyId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      setSelectedProperty(data as PropertyInfo);

      // Load projects for this property
      const projRes = await fetch(`/api/v1/property-projects?propertyId=${propertyId}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(Array.isArray(projData) ? projData : []);
      }
    } catch {
      setSelectedProperty(null);
    } finally {
      setPropertyLoading(false);
    }
  }, []);

  const handleOpenAsProject = useCallback(async (info: PendingParcel, lngLat: [number, number]) => {
    const res = await fetch("/api/v1/properties/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...info, lng: lngLat[0], lat: lngLat[1] }),
    });
    const property = await res.json() as { id: string };
    setPendingPropertyId(property.id);
    setPendingParcel(info);
  }, []);

  const handleSelectResult = useCallback((result: { id: string }) => {
    loadProperty(result.id);
  }, [loadProperty]);

  return (
    <div className="h-screen flex flex-col bg-fp-bg overflow-hidden">
      {/* ── Header ── */}
      <header className="h-16 flex items-center px-4 gap-4 glass shrink-0 z-20 border-b border-fp-border">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-fp-text leading-none">FairProcess</div>
            <div className="text-[10px] text-fp-text-dim uppercase tracking-widest mt-0.5">Evidence-First</div>
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all"
          title={sidebarOpen ? "Hide panel" : "Show panel"}
        >
          {sidebarOpen ? <PanelRight className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>

        <div className="flex-1 max-w-xl">
          <SearchBar onSelectResult={handleSelectResult} />
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <PropertyMap
            onSelectProperty={(id) => { if (id) loadProperty(id); }}
            selectedProperty={selectedProperty?.id ?? null}
            onOpenAsProject={handleOpenAsProject}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-fp-bg/20 via-transparent to-fp-bg/40" />
        </div>

        {sidebarOpen && (
          <aside className="w-[400px] border-l border-fp-border bg-fp-surface/80 backdrop-blur-xl flex flex-col overflow-hidden shrink-0 animate-[slide-right_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <div className="flex-1 overflow-y-auto">
              {propertyLoading && (
                <div className="p-4 space-y-3">
                  <div className="shimmer h-6 rounded w-3/4" />
                  <div className="shimmer h-4 rounded w-1/2" />
                  <div className="shimmer h-24 rounded-xl" />
                </div>
              )}

              {!propertyLoading && !selectedProperty && (
                <div className="flex-1 flex items-center justify-center p-8 text-center h-full">
                  <div>
                    <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-3">
                      <MapPin className="w-7 h-7 text-fp-text-dim" />
                    </div>
                    <p className="text-sm text-fp-text-muted">Click a parcel on the map to begin</p>
                    <p className="text-xs text-fp-text-dim mt-2">Search by APN or address above</p>
                  </div>
                </div>
              )}

              {!propertyLoading && selectedProperty && (
                <div className="p-4 space-y-4 animate-[fade-in_0.3s_ease-out]">
                  {/* Address header */}
                  <div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0">
                        <MapPin className="w-4.5 h-4.5 text-fp-cyan" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-fp-text leading-tight">
                          {selectedProperty.address || `APN ${selectedProperty.apn}`}
                        </h2>
                        {selectedProperty.city && (
                          <p className="text-sm text-fp-text-muted mt-0.5">{selectedProperty.city}, CA</p>
                        )}
                        <p className="text-xs text-fp-text-dim mt-1 font-mono">APN: {selectedProperty.apn}</p>
                      </div>
                    </div>
                  </div>

                  {/* Property attributes */}
                  <div className="glass rounded-xl p-4 space-y-2.5">
                    {selectedProperty.zoning && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <Building2 className="w-4 h-4 text-fp-text-dim shrink-0" />
                        <span className="text-fp-text-dim">Zoning</span>
                        <span className="text-fp-text ml-auto">{selectedProperty.zoning}</span>
                      </div>
                    )}
                    {selectedProperty.acres != null && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <Ruler className="w-4 h-4 text-fp-text-dim shrink-0" />
                        <span className="text-fp-text-dim">Lot Size</span>
                        <span className="text-fp-text ml-auto tabular-nums">{parseFloat(String(selectedProperty.acres)).toFixed(2)} acres</span>
                      </div>
                    )}
                    {selectedProperty.legal_desc && (
                      <div className="text-xs text-fp-text-dim pt-2 border-t border-fp-border">
                        {selectedProperty.legal_desc}
                      </div>
                    )}
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="glass rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-fp-text tabular-nums">{selectedProperty.projectCount}</div>
                      <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">Projects</div>
                    </div>
                    <div className="glass rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-fp-text tabular-nums">{selectedProperty.evidenceCount}</div>
                      <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">Evidence</div>
                    </div>
                    <div className="glass rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-fp-text tabular-nums">{selectedProperty.timelineCount}</div>
                      <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">Events</div>
                    </div>
                  </div>

                  {/* Existing projects */}
                  {projects.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Open Projects</h3>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => router.push(`/project/${p.id}`)}
                          className="w-full glass glass-hover rounded-xl p-3.5 transition-all text-left group animate-[slide-up_0.3s_ease-out]"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-fp-blue/15 flex items-center justify-center">
                              <FolderOpen className="w-4.5 h-4.5 text-fp-blue" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-fp-text truncate">{p.name}</div>
                              <div className="text-xs text-fp-text-dim">
                                {p.case_type?.replace(/_/g, " ")} · {p.status}
                              </div>
                            </div>
                            {p.due_process_score != null && (
                              <div className={`text-sm font-bold tabular-nums ${
                                p.due_process_score >= 80 ? "text-fp-green" :
                                p.due_process_score >= 60 ? "text-fp-amber" : "text-fp-red"
                              }`}>
                                {p.due_process_score}
                              </div>
                            )}
                            <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-text transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Open as Project button */}
                  <button
                    onClick={async () => {
                      if (!selectedProperty) return;
                      setPendingParcel({
                        apn: selectedProperty.apn,
                        address: selectedProperty.address,
                        city: selectedProperty.city,
                        acres: selectedProperty.acres ?? 0,
                        zoning: selectedProperty.zoning ?? "",
                        legal: selectedProperty.legal_desc ?? "",
                      });
                      setPendingPropertyId(selectedProperty.id);
                    }}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-fp-blue to-fp-cyan rounded-xl py-2.5 hover:shadow-lg hover:shadow-fp-blue/20 transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    Open as Project
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {pendingParcel && pendingPropertyId && (
        <NewProjectModal
          propertyId={pendingPropertyId}
          propertyLabel={`${pendingParcel.address || "No address"} · APN ${pendingParcel.apn}`}
          onClose={() => {
            setPendingParcel(null);
            setPendingPropertyId(null);
          }}
          onOpenProject={(projectId) => router.push(`/project/${projectId}`)}
        />
      )}
    </div>
  );
}
