"use client";

import { useState } from "react";
import { FileText, Shield, Mail, FileSignature } from "lucide-react";
import { BriefGeneratorPanel } from "./BriefGeneratorPanel";
import DefenseBuilderPanel from "./DefenseBuilderPanel";
import CommunicationsPanel from "./CommunicationsPanel";
import ResponseDraftPanel from "./ResponseDraftPanel";

type LegalTab = "briefs" | "defense" | "response" | "communications";

const TABS: { id: LegalTab; label: string; icon: typeof FileText; description: string }[] = [
  { id: "briefs", label: "Briefs", icon: FileText, description: "Generate case work product" },
  { id: "defense", label: "Defense", icon: Shield, description: "Select and refine arguments" },
  { id: "response", label: "Response", icon: FileSignature, description: "Review and finalize" },
  { id: "communications", label: "Mail & Proof", icon: Mail, description: "Send and track" },
];

export default function LegalToolsPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<LegalTab>("briefs");
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="max-w-5xl pb-10" role="region" aria-label="Defense and response workspace">
      <div className="mb-6">
        <div className="fp-eyebrow">Build the defense</div>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">Defense & response</h2>
        <p className="text-sm text-fp-text-muted mt-1">Move from supported findings to a reviewed response and documented proof.</p>
      </div>

      <div className="bg-white border border-fp-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-fp-border" role="tablist">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)} role="tab" aria-selected={active} className={`text-left px-4 py-3 transition-colors border-b-2 ${active ? "border-fp-blue bg-blue-50/50" : "border-transparent hover:bg-fp-surface-2"}`}>
                <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${active ? "text-fp-blue" : "text-fp-text-dim"}`} /><span className={`text-sm font-semibold ${active ? "text-fp-text" : "text-fp-text-muted"}`}>{item.label}</span></div>
                <div className="hidden sm:block text-[11px] text-fp-text-dim mt-1 ml-6">{item.description}</div>
              </button>
            );
          })}
        </div>
        <div className="p-4 sm:p-6">
          {tab === "briefs" && <BriefGeneratorPanel projectId={projectId} />}
          {tab === "defense" && <DefenseBuilderPanel projectId={projectId} />}
          {tab === "response" && <ResponseDraftPanel caseId={projectId} />}
          {tab === "communications" && <CommunicationsPanel caseId={projectId} />}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 px-1 text-[11px] text-fp-text-dim"><span>{activeTab.description}</span><span>Human review required before mailing</span></div>
    </div>
  );
}
