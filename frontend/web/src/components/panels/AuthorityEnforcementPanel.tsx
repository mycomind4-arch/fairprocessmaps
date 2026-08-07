"use client";

import { useState } from "react";
import { Building2, ShieldAlert, Network, FileText } from "lucide-react";
import BuildingDeptPanel from "./BuildingDeptPanel";
import CodeEnforcementPanel from "./CodeEnforcementPanel";

type SubTab = "agencies" | "chain" | "enforcement-actions" | "legal-authority";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Building2 }[] = [
  { id: "agencies", label: "Agencies & Departments", icon: Building2 },
  { id: "chain", label: "Chain of Authority", icon: Network },
  { id: "enforcement-actions", label: "Enforcement Actions", icon: ShieldAlert },
  { id: "legal-authority", label: "Legal Authority", icon: FileText },
];

export default function AuthorityEnforcementPanel({ projectId }: { projectId: string }) {
  const [subTab, setSubTab] = useState<SubTab>("agencies");

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
        {subTab === "agencies" && (
          <div className="space-y-6">
            {/* Agency selector within the agencies tab */}
            <AgencySelector projectId={projectId} />
          </div>
        )}

        {subTab === "chain" && <ChainOfAuthority projectId={projectId} />}

        {subTab === "enforcement-actions" && (
          <div className="space-y-6">
            <CodeEnforcementPanel projectId={projectId} />
          </div>
        )}

        {subTab === "legal-authority" && <LegalAuthority projectId={projectId} />}
      </div>
    </div>
  );
}

// ── Agency Selector: switch between Building Dept and Code Enforcement ──
function AgencySelector({ projectId }: { projectId: string }) {
  const [agency, setAgency] = useState<"building" | "code-enforcement">("building");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setAgency("building")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            agency === "building"
              ? "bg-fp-blue text-white shadow-sm"
              : "bg-fp-surface-2 text-fp-text-muted hover:text-fp-text border border-fp-border"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Building Department
        </button>
        <button
          onClick={() => setAgency("code-enforcement")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            agency === "code-enforcement"
              ? "bg-fp-blue text-white shadow-sm"
              : "bg-fp-surface-2 text-fp-text-muted hover:text-fp-text border border-fp-border"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Code Enforcement
        </button>
      </div>

      {agency === "building" && <BuildingDeptPanel projectId={projectId} />}
      {agency === "code-enforcement" && <CodeEnforcementPanel projectId={projectId} />}
    </div>
  );
}

// ── Chain of Authority: visual hierarchy graph ──
function ChainOfAuthority({ projectId }: { projectId: string }) {
  const authorityChain = [
    { level: "City Council", role: "Legislative Authority", icon: "🏛️" },
    { level: "City Manager", role: "Executive Authority", icon: "👔" },
    { level: "Department Director", role: "Administrative Authority", icon: "📋" },
    { level: "Building Official", role: "Code Interpretation", icon: "🏗️" },
    { level: "Code Enforcement Officer", role: "Field Enforcement", icon: "⚠️" },
    { level: "Inspector", role: "Inspection & Reporting", icon: "🔍" },
  ];

  return (
    <div className="space-y-4">
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20">
        <h2 className="text-lg font-semibold text-fp-text mb-1">Chain of Authority Graph</h2>
        <p className="text-sm text-fp-text-muted mb-6">
          Visual hierarchy of who holds power over this property. Click any node to see authority granted, applicable ordinances, and actions taken.
        </p>

        <div className="space-y-0">
          {authorityChain.map((node, idx) => (
            <div key={node.level} className="relative">
              {/* Connector line */}
              {idx < authorityChain.length - 1 && (
                <div className="absolute left-6 top-12 w-px h-8 bg-fp-border" />
              )}

              <div className="flex items-center gap-4 py-3 group cursor-pointer hover:bg-fp-surface-2/60 rounded-lg transition-all -mx-3 px-3">
                <div className="w-12 h-12 rounded-xl glass flex items-center justify-center text-xl shrink-0 group-hover:border-fp-blue/40 transition-all">
                  {node.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-fp-text">{node.level}</div>
                  <div className="text-xs text-fp-text-dim">{node.role}</div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-xs text-fp-blue font-medium">Click for details →</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
          <p className="text-xs text-fp-text-dim">
            <span className="font-medium text-fp-text-muted">AI Enhancement Coming:</span> The system will automatically connect each node to specific municipal code sections, state statutes, and actions taken on this property. Conflicts and intersections between authorities will be flagged automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Legal Authority: AI connects statutes to enforcement actions ──
function LegalAuthority({ projectId }: { projectId: string }) {
  return (
    <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20">
      <h2 className="text-lg font-semibold text-fp-text mb-1">Legal Authority Analysis</h2>
      <p className="text-sm text-fp-text-muted mb-6">
        AI connects enforcement actions to the specific municipal codes, state statutes, and administrative procedures that grant authority — and checks whether required notice periods and due process requirements were met.
      </p>

      <div className="space-y-3">
        <div className="p-4 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-3">
          <FileText className="w-5 h-5 text-fp-blue shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-fp-text">Municipal Code Sections</div>
            <div className="text-xs text-fp-text-dim mt-1">
              Specific code sections cited in enforcement actions, with full text and requirements.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-3">
          <FileText className="w-5 h-5 text-fp-blue shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-fp-text">State Statutes</div>
            <div className="text-xs text-fp-text-dim mt-1">
              Relevant state laws governing the enforcement process, including Government Code and Health & Safety Code provisions.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-3">
          <FileText className="w-5 h-5 text-fp-blue shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-fp-text">Required Notice Periods</div>
            <div className="text-xs text-fp-text-dim mt-1">
              Statutory notice requirements compared against actual notice given. Discrepancies are flagged in Legal Analysis.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-3">
          <FileText className="w-5 h-5 text-fp-blue shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-fp-text">Due Process Requirements</div>
            <div className="text-xs text-fp-text-dim mt-1">
              Procedural due process requirements (notice, hearing, appeal rights) checked against actual agency behavior.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-fp-blue/5 border border-fp-blue/20">
        <p className="text-xs text-fp-blue">
          <span className="font-medium">Tip:</span> Run Legal Analysis to see which specific statutes and code sections apply to this property's enforcement history.
        </p>
      </div>
    </div>
  );
}
