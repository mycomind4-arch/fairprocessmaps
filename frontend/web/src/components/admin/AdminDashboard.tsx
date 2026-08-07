"use client";

import { useState } from "react";
import {
  Settings, Users, Shield, Package, History, Activity,
  Building2, Loader2, ArrowLeft, Bell, Server,
} from "lucide-react";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { UserManagement } from "./UserManagement";
import { RolePermissions } from "./RolePermissions";
import { AuditLogViewer } from "./AuditLogViewer";
import { FeatureManagement } from "./FeatureManagement";
import type { Organization } from "@/lib/types/identity";

type AdminTab = "users" | "roles" | "features" | "audit" | "system";

const TABS: { id: AdminTab; label: string; icon: typeof Users }[] = [
  { id: "users", label: "Members", icon: Users },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "features", label: "Features", icon: Package },
  { id: "audit", label: "Audit Logs", icon: History },
  { id: "system", label: "System Events", icon: Activity },
];

interface AdminDashboardProps {
  organizations: Organization[];
  activeOrgId: string | null;
  onSwitchOrg: (orgId: string) => void;
  onBack?: () => void;
}

export function AdminDashboard({
  organizations,
  activeOrgId,
  onSwitchOrg,
  onBack,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  const hasOrg = activeOrgId !== null;

  return (
    <div className="flex flex-col h-full bg-fp-bg">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-fp-border shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-fp-surface-2 text-fp-text-muted hover:text-fp-text transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-fp-text">Administration</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 rounded-lg hover:bg-fp-surface-2 text-fp-text-muted relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-fp-cyan" />
          </button>
          <OrganizationSwitcher
            organizations={organizations}
            activeOrgId={activeOrgId}
            onSwitch={onSwitchOrg}
          />
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-fp-border bg-fp-surface/50 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isOrgTab = ["users", "features", "audit"].includes(tab.id);
          const isDisabled = !hasOrg && isOrgTab;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
                isActive
                  ? "border-fp-cyan text-fp-text"
                  : isDisabled
                  ? "border-transparent text-fp-text-dim/50 cursor-not-allowed"
                  : "border-transparent text-fp-text-muted hover:text-fp-text"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {!hasOrg && activeTab !== "roles" && activeTab !== "system" ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Building2 className="w-10 h-10 text-fp-text-dim mb-3" />
              <p className="text-sm text-fp-text-muted mb-1">No organization selected</p>
              <p className="text-xs text-fp-text-dim">
                Create or select an organization to manage members, features, and audit logs.
              </p>
            </div>
          ) : activeTab === "users" && hasOrg ? (
            <UserManagement orgId={activeOrgId} />
          ) : activeTab === "roles" ? (
            <RolePermissions />
          ) : activeTab === "features" && hasOrg ? (
            <FeatureManagement orgId={activeOrgId} />
          ) : activeTab === "audit" ? (
            <AuditLogViewer orgId={hasOrg ? activeOrgId : undefined} />
          ) : activeTab === "system" ? (
            <SystemEventsPanel />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── System Events sub-panel ──
function SystemEventsPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-fp-cyan" />
        <h3 className="text-sm font-semibold text-fp-text">System Events</h3>
        <span className="text-xs text-fp-text-dim">Operational log</span>
      </div>
      <div className="rounded-xl border border-fp-border bg-fp-surface p-6 text-center">
        <Server className="w-8 h-8 text-fp-text-dim mx-auto mb-2" />
        <p className="text-sm text-fp-text-muted">
          System event monitoring will be available once the backend API routes are deployed.
        </p>
        <p className="text-xs text-fp-text-dim mt-1">
          The `system_events` table is ready — API routes coming in the next iteration.
        </p>
      </div>
    </div>
  );
}
