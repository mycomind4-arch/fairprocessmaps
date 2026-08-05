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

interface NavItem {
  id: ProjectSection;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "findings";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "INVESTIGATION",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "intelligence", label: "Property Intelligence", icon: Search },
      { id: "timeline", label: "Timeline", icon: Calendar },
      { id: "discrepancies", label: "Due Process Analysis", icon: ScaleIcon, badgeKey: "findings" },
      { id: "vault", label: "Evidence Vault", icon: FolderArchive },
    ],
  },
  {
    title: "DEPARTMENTS",
    items: [
      { id: "building", label: "Building Dept", icon: Building2 },
      { id: "code-enforcement", label: "Code Enforcement", icon: ShieldAlert },
    ],
  },
  {
    title: "LEGAL",
    items: [
      { id: "legal", label: "Legal Library", icon: BookOpen },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { id: "connectors", label: "Connectors", icon: Plug },
      { id: "admin", label: "Administration", icon: Settings },
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
    <nav className="w-60 shrink-0 border-r border-fp-border bg-fp-surface/40 backdrop-blur-xl flex flex-col overflow-y-auto">
      {SECTIONS.map((section, sIdx) => (
        <div key={section.title} className={sIdx > 0 ? "pt-6" : "pt-4"}>
          {/* Section divider */}
          {sIdx > 0 && (
            <div className="mx-4 mb-3 border-t border-fp-border/40" />
          )}
          {/* Section label */}
          <div className="px-6 mb-1">
            <span className="text-[10px] font-semibold text-fp-text-dim tracking-[0.1em]">
              {section.title}
            </span>
          </div>
          {/* Items */}
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            const showBadge = item.badgeKey === "findings" && criticalFindingsCount > 0;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`flex items-center gap-3 pl-5 pr-4 py-3 text-sm text-left transition-colors relative group ${
                  isActive
                    ? "text-fp-text bg-fp-blue/10"
                    : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2/50"
                }`}
              >
                {/* Active indicator bar */}
                {isActive ? (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-fp-blue" />
                ) : (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-transparent group-hover:bg-fp-border transition-colors" />
                )}
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-fp-blue" : "text-fp-text-dim group-hover:text-fp-text-muted"}`} />
                <span className="flex-1 leading-tight font-medium">{item.label}</span>
                {showBadge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-fp-red/15 text-fp-red">
                    {criticalFindingsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
