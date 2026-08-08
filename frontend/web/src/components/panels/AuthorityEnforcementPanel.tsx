"use client";

import { useState } from "react";
import { Building2, ShieldAlert, Network, FileText, Landmark, User, Briefcase, HardHat, Search, RefreshCw, Loader2 } from "lucide-react";
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
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/v1/enforcement/sync?projectId=${projectId}`, { method: "POST" });
    } catch (e) {
      // Sync may fail if endpoint unavailable — non-blocking
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 pb-8" role="region" aria-label="Authority and Enforcement">
      {/* Header with sync */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fp-text">Authority & Enforcement</h2>
          <p className="text-sm text-fp-text-muted mt-0.5">Government agencies, enforcement actions, and legal authority</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors disabled:opacity-50"
          title="Sync enforcement data from county systems"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? "Syncing…" : "Sync Data"}
        </button>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 border-b border-fp-border pb-px overflow-x-auto" role="tablist">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              role="tab"
              aria-selected={active}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium transition-all relative border-b-2 whitespace-nowrap ${
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
          <div className="space-y-4">
            <AgencySelector projectId={projectId} />
          </div>
        )}

        {subTab === "chain" && <ChainOfAuthority projectId={projectId} />}

        {subTab === "enforcement-actions" && (
          <div className="space-y-4">
            <CodeEnforcementPanel projectId={projectId} />
          </div>
        )}

        {subTab === "legal-authority" && <LegalAuthority projectId={projectId} />}
      </div>
    </div>
  );
}

function AgencySelector({ projectId }: { projectId: string }) {
  const [agency, setAgency] = useState<"building" | "code-enforcement">("building");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setAgency("building")}
          className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            agency === "building"
              ? "bg-fp-blue text-white"
              : "bg-fp-surface-2 text-fp-text-muted hover:text-fp-text border border-fp-border"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Building Department
        </button>
        <button
          onClick={() => setAgency("code-enforcement")}
          className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            agency === "code-enforcement"
              ? "bg-fp-blue text-white"
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

function ChainOfAuthority({ projectId }: { projectId: string }) {
  const authorityChain = [
    { level: "City Council", role: "Legislative Authority", icon: Landmark },
    { level: "City Manager", role: "Executive Authority", icon: User },
    { level: "Department Director", role: "Administrative Authority", icon: Briefcase },
    { level: "Building Official", role: "Code Interpretation", icon: Building2 },
    { level: "Code Enforcement Officer", role: "Field Enforcement", icon: ShieldAlert },
    { level: "Inspector", role: "Inspection & Reporting", icon: HardHat },
  ];

  return (
    <div className="space-y-3">
      <div className="glass rounded-xl p-4">
        <h2 className="text-sm font-semibold text-fp-text mb-1">Chain of Authority</h2>
        <p className="text-xs text-fp-text-muted mb-4">
          Hierarchy of who holds power over this property. Click any node to see authority granted, applicable ordinances, and actions taken.
        </p>

        <div className="space-y-0">
          {authorityChain.map((node, idx) => {
            const Icon = node.icon;
            return (
              <div key={node.level} className="relative">
                {idx < authorityChain.length - 1 && (
                  <div className="absolute left-5 top-11 w-px h-6 bg-fp-border" />
                )}

                <div className="flex items-center gap-3 py-2 group cursor-pointer hover:bg-fp-surface-2/60 rounded-lg transition-all -mx-2 px-2">
                  <div className="w-10 h-10 rounded-lg surface-flat flex items-center justify-center shrink-0 group-hover:border-fp-blue/40 transition-all">
                    <Icon className="w-4 h-4 text-fp-text-muted" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-fp-text">{node.level}</div>
                    <div className="text-xs text-fp-text-dim">{node.role}</div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="text-xs text-fp-blue font-medium">Details →</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-2">
          <Search className="w-3.5 h-3.5 text-fp-text-dim shrink-0 mt-0.5" />
          <p className="text-xs text-fp-text-dim">
            <span className="font-medium text-fp-text-muted">Coming soon:</span> Automatic connection of each node to specific municipal code sections, state statutes, and actions taken on this property.
          </p>
        </div>
      </div>
    </div>
  );
}

function LegalAuthority({ projectId }: { projectId: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <h2 className="text-sm font-semibold text-fp-text mb-1">Legal Authority Analysis</h2>
      <p className="text-xs text-fp-text-muted mb-4">
        AI connects enforcement actions to the specific municipal codes, state statutes, and administrative procedures that grant authority — and checks whether required notice periods and due process requirements were met.
      </p>

      <div className="space-y-2">
        {[
          { title: "Municipal Code Sections", desc: "Specific code sections cited in enforcement actions, with full text and requirements." },
          { title: "State Statutes", desc: "Relevant state laws governing the enforcement process, including Government Code and Health & Safety Code provisions." },
          { title: "Required Notice Periods", desc: "Statutory notice requirements compared against actual notice given. Discrepancies are flagged in Legal Analysis." },
          { title: "Due Process Requirements", desc: "Procedural due process requirements (notice, hearing, appeal rights) checked against actual agency behavior." },
        ].map((item) => (
          <div key={item.title} className="p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/40 flex items-start gap-3">
            <FileText className="w-4 h-4 text-fp-blue shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-fp-text">{item.title}</div>
              <div className="text-xs text-fp-text-dim mt-0.5">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-fp-blue/5 border border-fp-blue/20 flex items-start gap-2">
        <Search className="w-3.5 h-3.5 text-fp-blue shrink-0 mt-0.5" />
        <p className="text-xs text-fp-blue">
          <span className="font-medium">Tip:</span> Run Legal Analysis to see which specific statutes and code sections apply to this property's enforcement history.
        </p>
      </div>
    </div>
  );
}
