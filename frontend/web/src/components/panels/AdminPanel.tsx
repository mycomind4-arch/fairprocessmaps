"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Users,
  Database,
  Download,
  Trash2,
  Plus,
  Shield,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Activity,
} from "lucide-react";

// ── Types ──
interface ProjectMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  added_at: string;
}

interface ProjectSettings {
  name: string;
  type: string;
  status: string;
  description: string;
  jurisdiction: string;
  auto_expire_days: number;
  notify_deadlines: boolean;
  notify_enforcement: boolean;
  notify_permit_changes: boolean;
}

// ── Component ──
export default function AdminPanel({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [activeTab, setActiveTab] = useState<"general" | "members" | "permissions" | "organization" | "danger" | "all">("all");

  useEffect(() => {
    // Load settings from localStorage
    const settingsKey = `fairprocess_admin_settings_${projectId}`;
    const membersKey = `fairprocess_admin_members_${projectId}`;

    const storedSettings = localStorage.getItem(settingsKey);
    if (storedSettings) {
      try {
        setSettings(JSON.parse(storedSettings));
      } catch {
        setSettings(defaultSettings());
      }
    } else {
      setSettings(defaultSettings());
    }

    const storedMembers = localStorage.getItem(membersKey);
    if (storedMembers) {
      try {
        setMembers(JSON.parse(storedMembers));
      } catch {
        setMembers([]);
      }
    } else {
      setMembers([
        {
          id: crypto.randomUUID(),
          name: "You",
          email: "owner@example.com",
          role: "admin",
          added_at: new Date().toISOString(),
        },
      ]);
    }
    setLoading(false);
  }, [projectId]);

  const defaultSettings = (): ProjectSettings => ({
    name: "",
    type: "Code Enforcement",
    status: "Open",
    description: "",
    jurisdiction: "Humboldt County, CA",
    auto_expire_days: 180,
    notify_deadlines: true,
    notify_enforcement: true,
    notify_permit_changes: false,
  });

  const saveSettings = () => {
    if (!settings) return;
    setSaving(true);
    const key = `fairprocess_admin_settings_${projectId}`;
    localStorage.setItem(key, JSON.stringify(settings));
    setTimeout(() => {
      setSaving(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }, 500);
  };

  const addMember = () => {
    if (!inviteEmail.trim()) return;
    const newMember: ProjectMember = {
      id: crypto.randomUUID(),
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      added_at: new Date().toISOString(),
    };
    const next = [...members, newMember];
    setMembers(next);
    localStorage.setItem(`fairprocess_admin_members_${projectId}`, JSON.stringify(next));
    setInviteEmail("");
    setShowInvite(false);
  };

  const removeMember = (id: string) => {
    const next = members.filter((m) => m.id !== id);
    setMembers(next);
    localStorage.setItem(`fairprocess_admin_members_${projectId}`, JSON.stringify(next));
  };

  const exportData = () => {
    const exportObj = {
      project_id: projectId,
      exported_at: new Date().toISOString(),
      settings,
      members: members.map((m) => ({ ...m, email: undefined })),
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fairprocess-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-fp-text-muted text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-fp-blue mr-3" />
        <span>Loading admin settings…</span>
      </div>
    );
  }

  if (!settings) return null;

  const showSection = (sec: string) => activeTab === "all" || activeTab === sec;

  return (
    <div className="space-y-8 pb-12 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Admin Settings</h2>
        <p className="text-sm text-fp-text-muted mt-1">Project configuration, member access, permissions, and system controls</p>
      </div>

      {/* Preview — not yet connected to live data */}
      <div className="flex items-start gap-3 rounded-[14px] border border-fp-amber/30 bg-fp-amber/10 p-4">
        <AlertTriangle className="h-5 w-5 text-fp-amber shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-fp-amber">Preview — not yet connected to live data</p>
          <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">
            Settings and member lists are stored locally in your browser only. Inviting a member does not send an email or grant real access — the member is only visible on this device. Project settings do not persist across browsers or survive a cache clear. These will be wired to D1 database tables and real invite-email sending in a future release.
          </p>
        </div>
      </div>

      {/* Quick Navigation Filter Bar */}
      <div className="flex items-center gap-2 border-b border-fp-border pb-4 flex-wrap">
        {[
          { id: "all", label: "All Sections", icon: Settings },
          { id: "general", label: "General", icon: Settings },
          { id: "members", label: "Users", icon: Users },
          { id: "permissions", label: "Permissions", icon: Shield },
          { id: "organization", label: "Organization", icon: Database },
          { id: "danger", label: "Danger Zone", icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? tab.id === "danger"
                    ? "bg-fp-red/15 text-fp-red border border-fp-red/40"
                    : "bg-fp-blue/15 text-fp-blue border border-fp-blue/40 shadow-sm"
                  : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 border border-transparent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: GENERAL */}
      {showSection("general") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Settings className="w-5 h-5 text-fp-blue" />
              1. General
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim">Project Identity</span>
          </div>

          <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 space-y-6">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                Project Name
              </label>
              <input
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:border-fp-blue focus:outline-none focus:ring-1 focus:ring-fp-blue transition-all"
                placeholder="Enter project name"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                Description
              </label>
              <textarea
                value={settings.description}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:border-fp-blue focus:outline-none focus:ring-1 focus:ring-fp-blue transition-all min-h-[90px] leading-relaxed"
                placeholder="Brief summary or case objective"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                  Project Type
                </label>
                <select
                  value={settings.type}
                  onChange={(e) => setSettings({ ...settings, type: e.target.value })}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
                >
                  <option>Code Enforcement</option>
                  <option>Permit Dispute</option>
                  <option>Zoning Challenge</option>
                  <option>Property Rights</option>
                  <option>General Investigation</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                  Status
                </label>
                <select
                  value={settings.status}
                  onChange={(e) => setSettings({ ...settings, status: e.target.value })}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
                >
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>On Hold</option>
                  <option>Closed</option>
                  <option>Archived</option>
                </select>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2: USERS */}
      {showSection("members") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Users className="w-5 h-5 text-fp-blue" />
              2. Users
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim">Team Access ({members.length})</span>
          </div>

          <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-fp-text-muted">
                Manage team members and collaborators who have access to this project.
              </p>
              <button
                onClick={() => setShowInvite(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-all shadow-md shrink-0"
              >
                <Plus className="h-4 w-4" />
                Invite Member
              </button>
            </div>

            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-fp-border bg-fp-surface-2/60 p-4 transition-all hover:border-fp-border-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fp-blue/15 border border-fp-blue/30 text-sm font-semibold text-fp-blue shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-fp-text truncate">{m.name}</span>
                        <RoleBadge role={m.role} />
                      </div>
                      <p className="text-xs text-fp-text-dim truncate mt-0.5">{m.email}</p>
                    </div>
                  </div>

                  {m.role !== "admin" && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="p-2 text-fp-text-muted hover:text-fp-red hover:bg-fp-red/10 rounded-lg transition-colors"
                      title="Remove Member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: PERMISSIONS */}
      {showSection("permissions") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Shield className="w-5 h-5 text-fp-blue" />
              3. Permissions
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Access Control &amp; Alerts</span>
          </div>

          <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-fp-text flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-fp-blue" />
                Notification &amp; Alert Settings
              </h4>
              <div className="space-y-3 pl-1">
                {[
                  { key: "notify_deadlines" as const, label: "Statutory Deadline Alerts", desc: "Get notified when statutory due process deadlines or permit expiration dates approach." },
                  { key: "notify_enforcement" as const, label: "Enforcement Case Updates", desc: "Receive immediate notifications when new code enforcement case filings are detected." },
                  { key: "notify_permit_changes" as const, label: "Permit Status Changes", desc: "Notify collaborators on permit status updates, inspection schedule changes, or new approvals." },
                ].map((item) => (
                  <label key={item.key} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-fp-surface-2/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings[item.key]}
                      onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                      className="mt-1 h-4 w-4 rounded border-fp-border bg-fp-surface accent-fp-blue focus:ring-fp-blue cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-medium text-fp-text">{item.label}</p>
                      <p className="text-xs text-fp-text-muted mt-0.5">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-fp-border">
              <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider mb-3">
                Role Permissions Reference
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RoleBadge role="admin" />
                  </div>
                  <p className="text-xs text-fp-text-muted">Full administrative control, team management, and settings configuration.</p>
                </div>
                <div className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RoleBadge role="editor" />
                  </div>
                  <p className="text-xs text-fp-text-muted">Can upload evidence, edit project records, and trigger AI agent analyses.</p>
                </div>
                <div className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RoleBadge role="viewer" />
                  </div>
                  <p className="text-xs text-fp-text-muted">Read-only access to view evidence vault, map timelines, and due process findings.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 4: ORGANIZATION */}
      {showSection("organization") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Database className="w-5 h-5 text-fp-blue" />
              4. Organization
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Jurisdiction &amp; Data</span>
          </div>

          <div className="rounded-[14px] glass p-6 shadow-lg shadow-black/20 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                  Jurisdiction
                </label>
                <input
                  value={settings.jurisdiction}
                  onChange={(e) => setSettings({ ...settings, jurisdiction: e.target.value })}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
                  placeholder="e.g. Humboldt County, CA"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">
                  Auto-Expire Permit Window (Days)
                </label>
                <input
                  type="number"
                  value={settings.auto_expire_days}
                  onChange={(e) => setSettings({ ...settings, auto_expire_days: parseInt(e.target.value) || 180 })}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none font-mono transition-all"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-fp-border flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-fp-text">Export Project Data</h4>
                <p className="text-xs text-fp-text-muted mt-0.5">Download project settings, evidence catalog, and member configuration as JSON.</p>
              </div>
              <button
                onClick={exportData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border hover:bg-fp-surface-2/80 text-xs font-medium text-fp-text transition-all shrink-0"
              >
                <Download className="h-4 w-4 text-fp-blue" />
                Export JSON
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SAVE BUTTON BAR (for Settings Sections) */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md hover:shadow-fp-blue/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFlash ? <Check className="h-4 w-4" /> : null}
          {saving ? "Saving Changes…" : savedFlash ? "Settings Saved!" : "Save Changes"}
        </button>
      </div>

      {/* SECTION 5: DANGER ZONE */}
      {showSection("danger") && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-red flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-fp-red" />
              5. Danger Zone
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-red font-medium">Irreversible Actions</span>
          </div>

          <div className="rounded-[14px] bg-fp-red/5 border border-fp-red/40 p-6 shadow-lg shadow-black/20 space-y-4">
            <div>
              <h4 className="text-base font-semibold text-fp-text">Delete Project</h4>
              <p className="text-sm text-fp-text-muted mt-1 leading-relaxed">
                Permanently delete this project and all associated evidence, cases, permits, and timeline events. This action is destructive and cannot be undone.
              </p>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-fp-red/40 bg-fp-red/10 text-xs font-medium text-fp-red hover:bg-fp-red/20 transition-all"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-fp-red/10 border border-fp-red/30 space-y-3">
                <p className="text-sm font-semibold text-fp-red">Are you absolutely sure you want to delete this project?</p>
                <p className="text-xs text-fp-text-muted">All local storage, connector settings, and member mappings for project ID <code className="font-mono text-fp-text">{projectId}</code> will be purged immediately.</p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-fp-border bg-fp-surface-2 text-xs font-medium text-fp-text hover:bg-fp-surface-2/80 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem(`fairprocess_admin_settings_${projectId}`);
                      localStorage.removeItem(`fairprocess_admin_members_${projectId}`);
                      localStorage.removeItem(`fairprocess_connectors_${projectId}`);
                      window.location.href = "/";
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fp-red text-white text-xs font-medium hover:bg-fp-red/90 transition-all shadow-md"
                  >
                    <Trash2 className="h-4 w-4" />
                    Yes, Delete Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Invite Member Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-md rounded-[14px] glass p-6 shadow-2xl shadow-black/50 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-fp-border">
              <h3 className="text-base font-semibold text-fp-text">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="p-1.5 text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:border-fp-blue focus:outline-none transition-all"
                  placeholder="colleague@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-1.5 block">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
                >
                  <option value="viewer">Viewer — read-only access</option>
                  <option value="editor">Editor — upload evidence &amp; manage cases</option>
                </select>
              </div>
              <button
                onClick={addMember}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md mt-2"
              >
                <Plus className="h-4 w-4" />
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: "admin" | "editor" | "viewer" }) {
  const config = {
    admin: { color: "bg-fp-blue/15 text-fp-blue border-fp-blue/30", label: "Admin" },
    editor: { color: "bg-fp-green/15 text-fp-green border-fp-green/30", label: "Editor" },
    viewer: { color: "bg-fp-surface-2 text-fp-text-dim border-fp-border", label: "Viewer" },
  };
  const { color, label } = config[role];
  return <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md border ${color}`}>{label}</span>;
}
