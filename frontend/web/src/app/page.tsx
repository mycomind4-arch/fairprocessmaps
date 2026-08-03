"use client";

import { useState, useCallback } from "react";
import PropertyMap from "@/components/PropertyMap";
import EvidencePanel from "@/components/EvidencePanel";
import TimelinePanel from "@/components/TimelinePanel";
import SearchBar from "@/components/SearchBar";
import DueProcessBadge from "@/components/DueProcessBadge";
import DocumentUpload from "@/components/DocumentUpload";
import PropertyDetail from "@/components/PropertyDetail";
import { FileText, Calendar, Upload, Info, PanelRightOpen, PanelRight } from "lucide-react";
import type { SearchResult } from "@/lib/types";

type PanelTab = "detail" | "evidence" | "timeline" | "upload";

const TABS: { id: PanelTab; label: string; icon: typeof FileText }[] = [
  { id: "detail", label: "Overview", icon: Info },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "upload", label: "Upload", icon: Upload },
];

export default function Home() {
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("detail");
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-fp-gray-200 flex items-center px-4 gap-4 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-fp-gray-400 hover:text-fp-gray-600 transition-colors"
            title={sidebarOpen ? "Hide panel" : "Show panel"}
          >
            {sidebarOpen ? <PanelRight className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
          <div className="font-semibold text-lg tracking-tight">FairProcess</div>
        </div>
        <div className="flex-1 max-w-xl">
          <SearchBar onSelectResult={handleSelectResult} />
        </div>
        <DueProcessBadge propertyId={selectedProperty} />
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <PropertyMap
            onSelectProperty={(id) => {
              setSelectedProperty(id);
              setActiveTab("detail");
            }}
            selectedProperty={selectedProperty}
          />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-96 border-l border-fp-gray-200 bg-fp-gray-50 flex flex-col overflow-hidden shrink-0">
            {/* Tabs */}
            <nav className="flex border-b border-fp-gray-200 bg-white">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    disabled={!selectedProperty && tab.id !== "upload"}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                      activeTab === tab.id
                        ? "border-fp-blue text-fp-blue"
                        : "border-transparent text-fp-gray-400 hover:text-fp-gray-600"
                    } ${!selectedProperty && tab.id !== "upload" ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Panel content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === "detail" && selectedProperty && (
                <div className="flex-1 overflow-y-auto">
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
                <div className="flex-1 overflow-y-auto">
                  <DocumentUpload
                    propertyId={selectedProperty}
                    onUploaded={handleUploaded}
                  />
                </div>
              )}
              {activeTab === "upload" && !selectedProperty && (
                <div className="flex-1 flex items-center justify-center p-4 text-center text-fp-gray-400">
                  <div>
                    <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Select a property first to upload evidence</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
