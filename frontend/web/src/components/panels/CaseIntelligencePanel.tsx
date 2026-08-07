"use client";

import { useState } from "react";
import { LayoutDashboard, Search } from "lucide-react";
import OverviewPanel from "./OverviewPanel";
import PropertyIntelligence from "./PropertyIntelligence";
import type { ProjectSection } from "@/components/ProjectNav";

type SubTab = "overview" | "details";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Search }[] = [
  { id: "overview", label: "Case Overview", icon: LayoutDashboard },
  { id: "details", label: "Property Details", icon: Search },
];

/**
 * Merges the former "Overview" and "Property Intelligence" sections into
 * a single "Property Intelligence" nav entry with internal sub-tabs.
 */
export default function CaseIntelligencePanel({
  projectId,
  propertyId,
  onNavigate,
}: {
  projectId: string;
  propertyId: string;
  onNavigate: (s: ProjectSection) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("overview");

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-1 border-b border-fp-border pb-px">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative border-b-2 ${
                active
                  ? "border-fp-blue text-fp-text"
                  : "border-transparent text-fp-text-dim hover:text-fp-text-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {active && (
                <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-fp-blue to-fp-cyan" />
              )}
            </button>
          );
        })}
      </div>

      <div className="animate-[fade-in_0.3s_ease-out]">
        {subTab === "overview" && (
          <OverviewPanel
            projectId={projectId}
            onNavigate={onNavigate}
            onOpenPropertyDetails={() => setSubTab("details")}
          />
        )}
        {subTab === "details" && <PropertyIntelligence propertyId={propertyId} />}
      </div>
    </div>
  );
}
