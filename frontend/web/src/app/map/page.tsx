"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import EvidencePanel from "@/components/EvidencePanel";
import TimelinePanel from "@/components/TimelinePanel";
import SearchBar from "@/components/SearchBar";
import DueProcessBadge from "@/components/DueProcessBadge";
import DocumentUpload from "@/components/DocumentUpload";
import PropertyDetail from "@/components/PropertyDetail";
import ScoreRing from "@/components/ScoreRing";
import NewProjectModal from "@/components/NewProjectModal";
import { FileText, Calendar, Upload, Info, PanelRightOpen, PanelRight, Shield } from "lucide-react";
import type { SearchResult } from "@/lib/types";

// Mirrors the ParcelInfo interface in PropertyMap.tsx — what the popup's
// "Open as project" button hands back.
interface PendingParcel {
  apn: string;
  address: string;
  city: string;
  acres: number;
  zoning: string;
  legal: string;
}

// Dynamic import — maplibre-gl requires browser APIs (WebGL/canvas)
const PropertyMap = dynamic(() => import("@/components/PropertyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-fp-bg">
      <div className="shimmer w-full h-full rounded-lg" />
    </div>
  ),
});

type PanelTab = "detail" | "evidence" | "timeline" | "upload";

const TABS: { id: PanelTab; label: string; icon: typeof FileText }[] = [
  { id: "detail", label: "Overview", icon: Info },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "upload", label: "Upload", icon: Upload },
];

export default function Home() {
  const router = useRouter();
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("detail");
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingParcel, setPendingParcel] = useState<PendingParcel | null>(null);
  const [pendingPropertyId, setPendingPropertyId] = useState<string | null>(null);

  // Popup's "Open as project" button lands here. We first resolve/create the
  // underlying Property record for this APN (properties are looked up by
  // APN, created on first contact), then show the new/existing project modal.
  const handleOpenAsProject = useCallback(async (info: PendingParcel, lngLat: [number, number]) => {
    const res = await fetch("/api/v1/properties/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...info, lng: lngLat[0], lat: lngLat[1] }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Failed to resolve property (${res.status})`);
    }
    const property = await res.json() as { id: string };
    setPendingPropertyId(property.id);
    setPendingParcel(info);
  }, []);

  const handleSelectResult = useCallback((result: SearchResult) => {
    if (result.type === "property" && result.id) {
      setSelectedProperty(result.id);
      setActiveTab("detail");
    } else if (result.property_id) {
      setSelectedProperty(result.property_id);
      setActiveTab(result.type === "evidence" ? "evidence" : "detail");
    }
  }, []);

  const handleUploaded = useCallback(() => {
    setEvidenceRefresh((k) => k + 1);
    setActiveTab("evidence");
  }, []);

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

        <DueProcessBadge propertyId={selectedProperty} />
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <PropertyMap
            onSelectProperty={(id) => {
              setSelectedProperty(id);
              setActiveTab("detail");
            }}
            selectedProperty={selectedProperty}
            onOpenAsProject={handleOpenAsProject}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-fp-bg/20 via-transparent to-fp-bg/40" />
        </div>

        {sidebarOpen && (
          <aside className="w-[400px] border-l border-fp-border bg-fp-surface/80 backdrop-blur-xl flex flex-col overflow-hidden shrink-0 animate-[slide-right_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <nav className="flex border-b border-fp-border shrink-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const disabled = !selectedProperty && tab.id !== "upload";
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    disabled={disabled}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all relative border-b-2 ${
                      active
                        ? "border-fp-blue text-fp-text"
                        : "border-transparent text-fp-text-dim hover:text-fp-text-muted"
                    } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {active && (
                      <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-fp-blue to-fp-cyan" />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === "detail" && selectedProperty && (
                <div className="flex-1 overflow-y-auto animate-[fade-in_0.3s_ease-out]">
                  <PropertyDetail
                    propertyId={selectedProperty}
                    onShowPanel={(panel) => setActiveTab(panel as PanelTab)}
                  />
                </div>
              )}
              {activeTab === "evidence" && (
                <EvidencePanel propertyId={selectedProperty} refreshKey={evidenceRefresh} />
              )}
              {activeTab === "timeline" && (
                <TimelinePanel propertyId={selectedProperty} refreshKey={evidenceRefresh} />
              )}
              {activeTab === "upload" && selectedProperty && (
                <div className="flex-1 overflow-y-auto animate-[fade-in_0.3s_ease-out]">
                  <DocumentUpload
                    propertyId={selectedProperty}
                    onUploaded={handleUploaded}
                  />
                </div>
              )}
              {activeTab === "upload" && !selectedProperty && (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-7 h-7 text-fp-text-dim" />
                    </div>
                    <p className="text-sm text-fp-text-muted">Select a property to upload evidence</p>
                  </div>
                </div>
              )}
              {activeTab === "detail" && !selectedProperty && (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                  <div>
                    <ScoreRing score={null} size="lg" />
                    <p className="text-sm text-fp-text-muted mt-4">Select a property to begin analysis</p>
                  </div>
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
