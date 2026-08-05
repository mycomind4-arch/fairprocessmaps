"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Building2, Check, Plus } from "lucide-react";
import type { Organization } from "@/lib/types/identity";

interface OrganizationSwitcherProps {
  organizations: Organization[];
  activeOrgId: string | null;
  onSwitch: (orgId: string) => void;
  onCreateOrg?: () => void;
}

export function OrganizationSwitcher({ organizations, activeOrgId, onSwitch, onCreateOrg }: OrganizationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (organizations.length === 0) {
    return (
      <button
        onClick={onCreateOrg}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-surface-2 hover:bg-fp-surface-3 text-sm text-fp-text-muted transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create Organization
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-surface-2 hover:bg-fp-surface-3 text-sm text-fp-text transition-colors min-w-[180px]"
      >
        <Building2 className="w-4 h-4 text-fp-cyan shrink-0" />
        <span className="truncate flex-1 text-left">{activeOrg?.name || "Select org"}</span>
        <ChevronDown className="w-4 h-4 text-fp-text-dim shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[220px] rounded-xl bg-fp-surface border border-fp-border shadow-xl z-50 overflow-hidden">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                onSwitch(org.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-fp-surface-2 text-sm text-fp-text transition-colors text-left"
            >
              <Building2 className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
              <span className="truncate flex-1">{org.name}</span>
              {org.id === activeOrgId && <Check className="w-4 h-4 text-fp-cyan shrink-0" />}
            </button>
          ))}
          {onCreateOrg && (
            <>
              <div className="border-t border-fp-border" />
              <button
                onClick={() => {
                  onCreateOrg();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-fp-surface-2 text-sm text-fp-cyan transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Organization
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
