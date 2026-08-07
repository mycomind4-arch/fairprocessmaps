"use client";

import {
  LayoutDashboard,
  Search,
  Building2,
  ShieldAlert,
  ScaleIcon,
  FolderArchive,
  BookOpen,
  Plug,
  Settings,
  Calendar,
  FileText,
  Network,
} from "lucide-react";

export type ProjectSection =
  | "overview"
  | "intelligence"
  | "timeline"
  | "graph"
  | "building"
  | "code-enforcement"
  | "discrepancies"
  | "vault"
  | "legal"
  | "briefs"
  | "connectors"
  | "admin";

interface NavItem {
  id: ProjectSection;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "findings";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "INVESTIGATION",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "intelligence", label: "Property Intelligence", icon: Search },
      { id: "timeline", label: "Timeline", icon: Calendar },
      { id: "graph", label: "Relationship Graph", icon: Network },
      { id: "building", label: "Building Dept", icon: Building2 },
      { id: "code-enforcement", label: "Code Enforcement", icon: ShieldAlert },
      { id: "discrepancies", label: "Due Process Discrepancies", icon: ScaleIcon, badgeKey: "findings" },
    ],
  },
  {
    title: "LEGAL",
    items: [
      { id: "vault", label: "Document Vault", icon: FolderArchive },
      { id: "legal", label: "Legal & Law Library", icon: BookOpen },
      { id: "briefs", label: "Brief Generator", icon: FileText },
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
}

export default function ProjectNav({ active, onSelect, criticalFindingsCount = 0 }: ProjectNavProps) {
  return (
    <nav className="w-64 shrink-0 border-r border-fp-border bg-fp-surface/60 backdrop-blur-xl flex flex-col py-4 overflow-y-auto">
      {NAV_GROUPS.map((group, groupIdx) => (
        <div key={group.title} className={groupIdx > 0 ? "mt-4" : ""}>
          {groupIdx > 0 && <div className="border-t border-fp-border mx-4 mb-4" />}
          <div className="px-6 pb-2 text-xs font-semibold uppercase tracking-wide text-fp-text-dim">
            {group.title}
          </div>
          <div className="space-y-0.5">
            {group.items.map((section) => {
              const Icon = section.icon;
              const isActive = active === section.id;
              const showBadge = section.badgeKey === "findings" && criticalFindingsCount > 0;
              return (
                <button
                  key={section.id}
                  onClick={() => onSelect(section.id)}
                  className={`flex items-center gap-4 px-6 py-3 text-sm text-left transition-all duration-150 relative w-full ${
                    isActive
                      ? "bg-fp-blue/15 text-fp-text font-semibold border-l-4 border-fp-blue shadow-sm"
                      : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2/80 border-l-4 border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-fp-blue" : "text-fp-text-dim"}`} />
                  <span className="flex-1 leading-tight">{section.label}</span>
                  {showBadge && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-fp-red/20 text-fp-red">
                      {criticalFindingsCount}
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
