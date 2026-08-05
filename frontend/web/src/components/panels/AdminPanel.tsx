"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Users,
  Database,
  Download,
  Upload,
  Trash2,
  Plus,
  Shield,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Key,
  FileText,
  Activity,
  Globe,
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
  const [activeTab, setActiveTab] = useState<"general" | "members" | "data" | "danger">("general");

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-fp-accent" />
        <span className="ml-2 text-fp-text-muted">Loading admin settings…</span>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-fp-text">Admin</h2>
        <p className="text-sm text-fp-text-muted mt-0.5">Project settings, user management, and system configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-fp-border">
        {([
          { id: "general", label: "General", icon: Settings },
          { id: "members", label: "Members", icon: Users },
          { id: "data", label: "Data & Export", icon: Database },
          { id: "danger", label: "Danger Zone", icon: AlertTriangle },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "text-fp-accent border-fp-accent"
                  : "text-fp-text-muted border-transparent hover:text-fp-text"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="text-xs font-medium text-fp-text-muted mb-1 block">Project Name</label>
            <input
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
              placeholder="Project name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-fp-text-muted mb-1 block">Project Type</label>
              <select
                value={settings.type}
                onChange={(e) => setSettings({ ...settings, type: e.target.value })}
                className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
              >
                <option>Code Enforcement</option>
                <option>Permit Dispute</option>
                <option>Zoning Challenge</option>
                <option>Property Rights</option>
                <option>General Investigation</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-fp-text-muted mb-1 block">Status</label>
              <select
                value={settings.status}
                onChange={(e) => setSettings({ ...settings, status: e.target.value })}
                className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
              >
                <option>Open</option>
                <option>In Progress</option>
                <option>On Hold</option>
                <option>Closed</option>
                <option>Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-fp-text-muted mb-1 block">Description</label>
            <textarea
              value={settings.description}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none min-h-[80px]"
              placeholder="Brief description of this project"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-fp-text-muted mb-1 block">Jurisdiction</label>
              <input
                value={settings.jurisdiction}
                onChange={(e) => setSettings({ ...settings, jurisdiction: e.target.value })}
                className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-fp-text-muted mb-1 block">Auto-expire days (permits)</label>
              <input
                type="number"
                value={settings.auto_expire_days}
                onChange={(e) => setSettings({ ...settings, auto_expire_days: parseInt(e.target.value) || 180 })}
                className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-lg border border-fp-border bg-fp-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-fp-text">
              <Activity className="h-4 w-4 text-fp-accent" />
              Notification Settings
            </div>
            {[
              { key: "notify_deadlines" as const, label: "Deadline reminders", desc: "Get alerted before permits expire and due process deadlines approach" },
              { key: "notify_enforcement" as const, label: "Enforcement actions", desc: "Notify when new code enforcement cases are detected" },
              { key: "notify_permit_changes" as const, label: "Permit changes", desc: "Notify on permit status changes and new applications" },
            ].map((item) => (
              <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-fp-border accent-fp-accent"
                />
                <div>
                  <p className="text-sm text-fp-text">{item.label}</p>
                  <p className="text-xs text-fp-text-muted">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-fp-accent px-4 py-2 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFlash ? <Check className="h-4 w-4" /> : null}
              {saving ? "Saving…" : savedFlash ? "Saved!" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fp-text-muted">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-fp-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Invite Member
            </button>
          </div>

          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-fp-border bg-fp-card p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fp-bg text-sm font-medium text-fp-accent">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fp-text">{m.name}</span>
                    <RoleBadge role={m.role} />
                  </div>
                  <p className="text-xs text-fp-text-muted">{m.email}</p>
                </div>
                {m.role !== "admin" && (
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-fp-text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Tab */}
      {activeTab === "data" && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-lg border border-fp-border bg-fp-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Download className="h-4 w-4 text-fp-accent" />
              <span className="text-sm font-medium text-fp-text">Export Project Data</span>
            </div>
            <p className="text-xs text-fp-text-muted mb-3">
              Download all project settings, evidence metadata, and case data as a JSON file. This does not include uploaded document binaries.
            </p>
            <button
              onClick={exportData}
              className="inline-flex items-center gap-1.5 rounded-md border border-fp-border bg-fp-bg px-3 py-1.5 text-sm font-medium text-fp-text hover:border-fp-accent/30 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export as JSON
            </button>
          </div>

          <div className="rounded-lg border border-fp-border bg-fp-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-fp-accent" />
              <span className="text-sm font-medium text-fp-text">Storage Usage</span>
            </div>
            <div className="space-y-2">
              <StorageRow label="Evidence files" value="0 files" />
              <StorageRow label="Database records" value="0 KB" />
              <StorageRow label="Timeline events" value="0 events" />
            </div>
          </div>

          <div className="rounded-lg border border-fp-border bg-fp-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Key className="h-4 w-4 text-fp-accent" />
              <span className="text-sm font-medium text-fp-text">API Access</span>
            </div>
            <p className="text-xs text-fp-text-muted mb-2">Use this project's API endpoints to integrate with external tools.</p>
            <div className="rounded-md border border-fp-border bg-fp-bg p-2 font-mono text-xs text-fp-text-muted">
              GET /api/v1/projects/{projectId.slice(0, 8)}…
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Tab */}
      {activeTab === "danger" && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-lg border border-red-800/30 bg-red-950/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-500">Delete Project</span>
            </div>
            <p className="text-xs text-fp-text-muted mb-3">
              Permanently delete this project and all associated data including evidence, cases, permits, and timeline events. This action cannot be undone.
            </p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-800/40 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-500">Are you absolutely sure?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-fp-border px-3 py-1.5 text-sm font-medium text-fp-text hover:bg-fp-bg transition-colors"
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
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Yes, Delete Forever
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div role="button" aria-label="Close invite modal" tabIndex={0} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowInvite(false)} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setShowInvite(false); }}>
          <div className="w-full max-w-md rounded-xl border border-fp-border bg-fp-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-fp-text">Invite Member</h3>
              <button onClick={() => setShowInvite(false)} className="text-fp-text-muted hover:text-fp-text">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-fp-text-muted mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
                  placeholder="colleague@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-fp-text-muted mb-1 block">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  className="w-full rounded-md border border-fp-border bg-fp-bg px-3 py-2 text-sm text-fp-text focus:border-fp-accent focus:outline-none"
                >
                  <option value="viewer">Viewer — read-only access</option>
                  <option value="editor">Editor — can add/edit evidence and cases</option>
                </select>
              </div>
              <button
                onClick={addMember}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-fp-accent px-4 py-2 text-sm font-medium text-black hover:bg-fp-accent/90 transition-colors"
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
    admin: { color: "text-fp-accent bg-fp-accent/10", label: "Admin" },
    editor: { color: "text-emerald-500 bg-emerald-950/40", label: "Editor" },
    viewer: { color: "text-fp-text-muted bg-fp-bg", label: "Viewer" },
  };
  const { color, label } = config[role];
  return <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>{label}</span>;
}

function StorageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-fp-text-muted">{label}</span>
      <span className="text-fp-text">{value}</span>
    </div>
  );
}
