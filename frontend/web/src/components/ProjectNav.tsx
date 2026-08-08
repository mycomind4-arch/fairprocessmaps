"use client";

import {
  Search,
  Building2,
  FolderArchive,
  Plug,
  Settings,
  Calendar,
  ScaleIcon,
  Bot,
  FileText,
  Network,
  Gavel,
  Shield,
} from "lucide-react";

export type ProjectSection =
  | "intelligence"
  | "authority"
  | "timeline"
  | "vault"
  | "analysis"
  | "legal"
  | "graph"
  | "connectors"
  | "admin";

interface NavItem {
  id: ProjectSection;
  label: string;
  icon: typeof Search;
  badgeKey?: "findings" | "ai-review";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "INVESTIGATION",
    items: [
      { id: "intelligence", label: "Property Intelligence", icon: Search },
      { id: "authority", label: "Authority & Enforcement", icon: Building2 },
      { id: "timeline", label: "Timeline", icon: Calendar },
      { id: "vault", label: "Evidence", icon: FolderArchive },
      { id: "analysis", label: "Analysis", icon: ScaleIcon, badgeKey: "findings" },
    ],
  },
  {
    title: "LEGAL & GRAPH",
    items: [
      { id: "legal", label: "Legal Tools", icon: Gavel },
      { id: "graph", label: "Case Graph", icon: Network, badgeKey: "ai-review" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { id: "connectors", label: "Connectors & Skills", icon: Plug },
      { id: "admin", label: "Admin", icon: Settings },
    ],
  },
];

interface ProjectNavProps {
  active: ProjectSection;
  onSelect: (section: ProjectSection) => void;
  criticalFindingsCount?: number;
  aiReviewCount?: number;
}

export default function ProjectNav({ active, onSelect, criticalFindingsCount = 0, aiReviewCount = 0 }: ProjectNavProps) {
  return (
    <nav className="w-56 shrink-0 border-r border-fp-border bg-fp-surface/60 backdrop-blur-xl flex flex-col py-3 overflow-y-auto lg:w-64" aria-label="Project navigation">
      {NAV_GROUPS.map((group, groupIdx) => (
        <div key={group.title} className={groupIdx > 0 ? "mt-3" : ""}>
          {groupIdx > 0 && <div className="border-t border-fp-border mx-3 mb-3" />}
          <div className="px-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-fp-text-dim">
            {group.title}
          </div>
          <div className="space-y-0.5">
            {group.items.map((section) => {
              const Icon = section.icon;
              const isActive = active === section.id;
              const showBadge = section.badgeKey === "findings" && criticalFindingsCount > 0;
              const showAI = section.badgeKey === "ai-review" && aiReviewCount > 0;
              return (
                <button
                  key={section.id}
                  onClick={() => onSelect(section.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-2 text-sm text-left transition-all duration-150 relative w-full ${
                    isActive
                      ? "bg-fp-blue/15 text-fp-text font-semibold border-l-2 border-fp-blue"
                      : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2/80 border-l-2 border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-fp-blue" : "text-fp-text-dim"}`} />
                  <span className="flex-1 leading-tight">{section.label}</span>
                  {showBadge && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-fp-red/20 text-fp-red">
                      {criticalFindingsCount}
                    </span>
                  )}
                  {showAI && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-fp-blue/20 text-fp-blue">
                      {aiReviewCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
