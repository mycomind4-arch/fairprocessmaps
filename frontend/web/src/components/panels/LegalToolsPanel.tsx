"use client";

import { useState } from "react";
import { FileText, Shield } from "lucide-react";
import { BriefGeneratorPanel } from "./BriefGeneratorPanel";
import DefenseBuilderPanel from "./DefenseBuilderPanel";

type LegalTab = "briefs" | "defense";

const TABS: { id: LegalTab; label: string; icon: typeof FileText }[] = [
  { id: "briefs", label: "Brief Generator", icon: FileText },
  { id: "defense", label: "Defense Builder", icon: Shield },
];

export default function LegalToolsPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<LegalTab>("briefs");

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Legal Tools">
      <div className="flex items-center gap-1 border-b border-fp-border pb-px overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={active}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                active
                  ? "text-fp-blue border-fp-blue"
                  : "text-fp-text-muted hover:text-fp-text border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "briefs" && <BriefGeneratorPanel projectId={projectId} />}
      {tab === "defense" && <DefenseBuilderPanel projectId={projectId} />}
    </div>
  );
}
