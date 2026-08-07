"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, FileText } from "lucide-react";
import DiscrepanciesPanel from "./DiscrepanciesPanel";
import LegalLibraryPanel from "./LegalLibraryPanel";
import { BriefGeneratorPanel } from "./BriefGeneratorPanel";

type SubTab = "findings" | "library" | "briefs";

const SUB_TABS: { id: SubTab; label: string; icon: typeof BookOpen }[] = [
  { id: "findings", label: "Due Process Findings", icon: AlertTriangle },
  { id: "library", label: "Legal & Law Library", icon: BookOpen },
  { id: "briefs", label: "Brief Generator", icon: FileText },
];

export default function LegalAnalysisPanel({ projectId }: { projectId: string }) {
  const [subTab, setSubTab] = useState<SubTab>("findings");

  return (
    <div className="space-y-4 pb-8">
      {/* Sub-tab navigation */}
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

      {/* Sub-tab content */}
      <div className="animate-[fade-in_0.3s_ease-out]">
        {subTab === "findings" && <DiscrepanciesPanel projectId={projectId} />}

        {subTab === "library" && <LegalLibraryPanel />}

        {subTab === "briefs" && <BriefGeneratorPanel projectId={projectId} />}
      </div>
    </div>
  );
}
