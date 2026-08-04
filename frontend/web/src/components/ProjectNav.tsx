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
} from "lucide-react";

export type ProjectSection =
  | "overview"
  | "intelligence"
  | "timeline"
  | "building"
  | "code-enforcement"
  | "discrepancies"
  | "vault"
  | "legal"
  | "connectors"
  | "admin";

const SECTIONS: { id: ProjectSection; label: string; icon: typeof LayoutDashboard; badgeKey?: "findings" }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "intelligence", label: "Property Intelligence", icon: Search },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "building", label: "Building Dept", icon: Building2 },
  { id: "code-enforcement", label: "Code Enforcement", icon: ShieldAlert },
  { id: "discrepancies", label: "Due Process Discrepancies", icon: ScaleIcon, badgeKey: "findings" },
  { id: "vault", label: "Document Vault", icon: FolderArchive },
  { id: "legal", label: "Legal & Law Library", icon: BookOpen },
  { id: "connectors", label: "Connectors & Skills", icon: Plug },
  { id: "admin", label: "Admin", icon: Settings },
];

interface ProjectNavProps {
  active: ProjectSection;
  onSelect: (section: ProjectSection) => void;
  criticalFindingsCount?: number;
}

export default function ProjectNav({ active, onSelect, criticalFindingsCount = 0 }: ProjectNavProps) {
  return (
    <nav className="w-56 shrink-0 border-r border-fp-border bg-fp-surface/60 backdrop-blur-xl flex flex-col py-3 overflow-y-auto">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = active === section.id;
        const showBadge = section.badgeKey === "findings" && criticalFindingsCount > 0;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-all relative ${
              isActive
                ? "bg-fp-blue/15 text-fp-text border-l-2 border-fp-blue"
                : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border-l-2 border-transparent"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 leading-tight">{section.label}</span>
            {showBadge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-fp-red/20 text-fp-red">
                {criticalFindingsCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
