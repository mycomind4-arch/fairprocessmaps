"use client";

import { useState } from "react";
import PropertyMap from "@/components/PropertyMap";
import EvidencePanel from "@/components/EvidencePanel";
import TimelinePanel from "@/components/TimelinePanel";
import SearchBar from "@/components/SearchBar";
import DueProcessBadge from "@/components/DueProcessBadge";

export default function Home() {
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-fp-gray-200 flex items-center px-4 gap-4 bg-white shrink-0">
        <div className="font-semibold text-lg tracking-tight">FairProcess</div>
        <div className="flex-1 max-w-xl">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <DueProcessBadge propertyId={selectedProperty} />
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <PropertyMap
            onSelectProperty={setSelectedProperty}
            selectedProperty={selectedProperty}
          />
        </div>

        {/* Sidebar */}
        <aside className="w-96 border-l border-fp-gray-200 bg-fp-gray-50 flex flex-col overflow-hidden shrink-0">
          <EvidencePanel propertyId={selectedProperty} />
          <TimelinePanel propertyId={selectedProperty} />
        </aside>
      </div>
    </div>
  );
}
