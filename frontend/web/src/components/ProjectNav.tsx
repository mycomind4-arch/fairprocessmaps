"use client";

import {
  Search,
  Building2,
  FolderArchive,
  Plug,
  Settings,
  Calendar,
  ScaleIcon,
  Network,
  Gavel,
  FileSignature,
  Mail,
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
  badgeKey?: "findings" | "mail";
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "CASE WORKSPACE",
    items: [
      { id: "intelligence", label: "Property & Records", icon: Search },
      { id: "authority", label: "Authorities", icon: Building2 },
      { id: "vault", label: "Evidence", icon: FolderArchive },
      { id: "timeline", label: "Timeline", icon: Calendar },
      { id: "analysis", label: "Analysis", icon: ScaleIcon, badgeKey: "findings" },
    ],
  },
  {
    title: "BUILD THE DEFENSE",
    items: [
      { id: "legal", label: "Defense & Response", icon: Gavel },
      { id: "graph", label: "Case Graph", icon: Network },
    ],
  },
  {
    title: "CASE SYSTEM",
    items: [
      { id: "connectors", label: "Sources & Connectors", icon: Plug },
      { id: "admin", label: "Case Settings", icon: Settings },
    ],
  },
];

interface ProjectNavProps {
  active: ProjectSection;
  onSelect: (section: ProjectSection) => void;
  criticalFindingsCount?: number;
  aiReviewCount?: number;
}

export default function ProjectNav({ active, onSelect, criticalFindingsCount = 0 }: ProjectNavProps) {
  return (
    <nav className="w-[248px] shrink-0 border-r border-fp-border bg-white flex flex-col overflow-y-auto h-full" aria-label="Case navigation">
      <div className="px-5 pt-5 pb-3">
        <div className="fp-eyebrow">Case workspace</div>
        <div className="mt-1 text-sm font-semibold text-fp-text">Build, verify, defend</div>
      </div>
      <div className="px-2 pb-4">
        {NAV_GROUPS.map((group, groupIdx) => (
          <div key={group.title} className={groupIdx > 0 ? "mt-5 pt-4 border-t border-fp-border" : ""}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fp-text-dim">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                      isActive
                        ? "bg-blue-50 text-fp-text font-semibold"
                        : "text-fp-text-muted hover:bg-fp-surface-2 hover:text-fp-text"
                    }`}
                  >
                    <Icon className={`w-[17px] h-[17px] shrink-0 ${isActive ? "text-fp-blue" : "text-fp-text-dim group-hover:text-fp-text-muted"}`} />
                    <span className="flex-1 leading-tight">{item.label}</span>
                    {item.badgeKey === "findings" && criticalFindingsCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-50 text-red-700 border border-red-100 text-[10px] font-semibold flex items-center justify-center">
                        {criticalFindingsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-fp-border p-4">
        <div className="rounded-lg bg-fp-surface-2 border border-fp-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-fp-text"><FileSignature className="w-3.5 h-3.5 text-fp-blue" /> Case workflow</div>
          <div className="text-[11px] text-fp-text-dim mt-1 leading-relaxed">Evidence → analysis → defense → response → proof</div>
        </div>
      </div>
    </nav>
  );
}
