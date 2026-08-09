"use client";

import { useState } from "react";
import { ScaleIcon, Bot, Activity, Clock, Sparkles } from "lucide-react";
import LegalAnalysisPanel from "./LegalAnalysisPanel";
import AIReviewPanel from "./AIReviewPanel";
import ClaudeReviewPanel from "./ClaudeReviewPanel";
import { EventReconstructionPanel } from "./EventReconstruction";
import { ProceduralClockPanel } from "./ProceduralClock";

type AnalysisTab = "findings" | "ai-review" | "claude" | "reconstruction" | "procedural-clock";

const TABS: { id: AnalysisTab; label: string; icon: typeof ScaleIcon }[] = [
  { id: "findings", label: "Findings", icon: ScaleIcon },
  { id: "ai-review", label: "AI Review", icon: Bot },
  { id: "claude", label: "Claude Synthesis", icon: Sparkles },
  { id: "reconstruction", label: "Event Reconstruction", icon: Activity },
  { id: "procedural-clock", label: "Procedural Clock", icon: Clock },
];

export default function AnalysisPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<AnalysisTab>("findings");

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Analysis">
      <div className="flex items-center gap-1 border-b border-fp-border pb-px overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} role="tab" aria-selected={active} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${active ? "text-fp-blue border-fp-blue" : "text-fp-text-muted hover:text-fp-text border-transparent"}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {tab === "findings" && <LegalAnalysisPanel projectId={projectId} />}
      {tab === "ai-review" && <AIReviewPanel projectId={projectId} />}
      {tab === "claude" && <ClaudeReviewPanel caseId={projectId} />}
      {tab === "reconstruction" && <EventReconstructionPanel projectId={projectId} />}
      {tab === "procedural-clock" && <ProceduralClockPanel projectId={projectId} />}
    </div>
  );
}
