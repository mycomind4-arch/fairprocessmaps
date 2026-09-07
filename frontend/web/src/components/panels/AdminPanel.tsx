"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import {
  Settings,
  Users,
  Building2,
  Download,
  FileArchive,
  Trash2,
  Plus,
  Shield,
  AlertTriangle,
  Loader2,
  Check,
  X,
  History,
  Search,
  Copy,
  Archive,
  RotateCcw,
  Lock,
} from "lucide-react";

// ── Types ──

// project_members — a per-case roster (attorneys, property owners,
// witnesses...). Informational only; does NOT grant login access.
interface RosterMember {
  id: string;
  name: string;
  email: string;
  role: string;
  added_at: string;
}

// organization_members joined with users — real, login-capable accounts.
// This is what actually determines what a person can do, via
// security/authorization.ts's role -> permission map.
const ORG_ROLES = ["admin", "investigator", "attorney", "advocate", "reviewer", "viewer", "manager", "analyst"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  admin: "Full access, including managing members, org settings, and the audit log.",
  investigator: "Create/update cases, upload evidence, run analysis and agents.",
  attorney: "Everything an investigator can do, plus reviewing findings and relationships.",
  advocate: "Read the case, upload evidence, communicate — no ability to run analysis-changing actions.",
  reviewer: "Reviews findings and agent proposals; read-only otherwise.",
  manager: "Broad update rights across cases, evidence, and relationships.",
  analyst: "Read and run analysis; cannot upload evidence or modify records.",
  viewer: "Read-only access.",
};

interface OrgMember {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: OrgRole;
  status: "active" | "suspended" | "removed";
  joined_at: string;
}

interface OrgIdentity {
  id: string;
  name: string;
  slug: string;
  org_type: string;
  status: string;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null;
  created_at: string;
}

interface ProjectSettings {
  description: string;
  jurisdiction: string;
  auto_expire_days: number;
  notify_deadlines: boolean;
  notify_enforcement: boolean;
  notify_permit_changes: boolean;
}

function defaultSettings(): ProjectSettings {
  return {
    description: "",
    jurisdiction: "Humboldt County, CA",
    auto_expire_days: 180,
    notify_deadlines: true,
    notify_enforcement: true,
    notify_permit_changes: false,
  };
}

type Tab = "general" | "roster" | "organization" | "permissions" | "audit" | "danger" | "all";

// ── Component ──
export default function AdminPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === "admin";

  const [settings, setSettings] = useState<ProjectSettings>(defaultSettings());
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [showInviteRoster, setShowInviteRoster] = useState(false);

  const [org, setOrg] = useState<OrgIdentity | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [showInviteOrgMember, setShowInviteOrgMember] = useState(false);
  const [lastTempPassword, setLastTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");

  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const [exportingCaseFile, setExportingCaseFile] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [errorFlash, setErrorFlash] = useState<string | null>(null);

  // ── Project settings ──
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`/api/v1/project-settings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } });
      const data = await res.json() as { settings?: Partial<ProjectSettings> | null };
      setSettings({ ...defaultSettings(), ...(data.settings ?? {}) });
    } catch {
      setSettings(defaultSettings());
    } finally {
      setSettingsLoading(false);
    }
  }, [projectId]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/project-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setErrorFlash(String(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Case roster (project_members — informational, no login access) ──
  const fetchRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/v1/members?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } });
      const data = await res.json() as { items?: RosterMember[] };
      setRoster(data.items ?? []);
    } catch {
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, [projectId]);

  const addRosterMember = async (email: string, name: string, role: string) => {
    const res = await fetch("/api/v1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, email, name, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "Failed to add");
    }
    await fetchRoster();
  };

  const removeRosterMember = async (id: string) => {
    await fetch(`/api/v1/members?id=${id}`, { method: "DELETE" });
    fetchRoster();
  };

  // ── Organization (real login-capable members — admin only) ──
  const fetchOrg = useCallback(async () => {
    if (!isOrgAdmin) return;
    setOrgLoading(true);
    try {
      const [orgRes, membersRes] = await Promise.all([
        fetch("/api/v1/admin/organization", { headers: { "Cache-Control": "no-cache" } }),
        fetch("/api/v1/admin/org-members", { headers: { "Cache-Control": "no-cache" } }),
      ]);
      const orgData = await orgRes.json() as { organization?: OrgIdentity };
      const membersData = await membersRes.json() as { items?: OrgMember[] };
      setOrg(orgData.organization ?? null);
      setOrgMembers(membersData.items ?? []);
    } catch {
      setOrg(null);
      setOrgMembers([]);
    } finally {
      setOrgLoading(false);
    }
  }, [isOrgAdmin]);

  const saveOrgName = async (name: string) => {
    const res = await fetch("/api/v1/admin/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to rename organization");
    fetchOrg();
  };

  const inviteOrgMember = async (email: string, name: string, role: OrgRole) => {
    const res = await fetch("/api/v1/admin/org-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const data = await res.json() as { error?: string; temporary_password?: string | null };
    if (!res.ok) throw new Error(data.error || "Invite failed");
    if (data.temporary_password) {
      setLastTempPassword({ email, password: data.temporary_password });
    }
    fetchOrg();
  };

  const updateOrgMember = async (id: string, patch: { role?: OrgRole; status?: string }) => {
    const res = await fetch(`/api/v1/admin/org-members?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setErrorFlash(data.error || "Update failed");
      return;
    }
    fetchOrg();
  };

  // ── Audit log (admin only) ──
  const fetchAuditLogs = useCallback(async () => {
    if (!isOrgAdmin) return;
    setAuditLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "100" });
      if (auditSearch) qs.set("search", auditSearch);
      const res = await fetch(`/api/v1/admin/audit-logs?${qs}`, { headers: { "Cache-Control": "no-cache" } });
      const data = await res.json() as { items?: AuditLogEntry[] };
      setAuditLogs(data.items ?? []);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, [isOrgAdmin, auditSearch]);

  // ── Project status (archive / reopen) ──
  const fetchProjectStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects?id=${projectId}`, { headers: { "Cache-Control": "no-cache" } });
      const data = await res.json() as { status?: string };
      setProjectStatus(data.status ?? null);
    } catch {
      setProjectStatus(null);
    }
  }, [projectId]);

  const setProjectArchived = async (archived: boolean) => {
    setArchiving(true);
    try {
      const res = await fetch(`/api/v1/property-projects?id=${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archived ? "archived" : "open" }),
      });
      if (!res.ok) throw new Error("Status change failed");
      setProjectStatus(archived ? "archived" : "open");
      setShowArchiveConfirm(false);
    } catch (err) {
      setErrorFlash(String(err));
    } finally {
      setArchiving(false);
    }
  };

  useEffect(() => { fetchSettings(); fetchRoster(); fetchProjectStatus(); }, [fetchSettings, fetchRoster, fetchProjectStatus]);
  useEffect(() => { if (activeTab === "organization" || activeTab === "all") fetchOrg(); }, [activeTab, fetchOrg]);
  useEffect(() => { if (activeTab === "audit" || activeTab === "all") fetchAuditLogs(); }, [activeTab, fetchAuditLogs]);

  useEffect(() => {
    if (errorFlash) {
      const t = setTimeout(() => setErrorFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorFlash]);

  const downloadCaseFile = async () => {
    setExportingCaseFile(true);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/export`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Export failed");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `fairprocess-${projectId}.fpcase.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setErrorFlash(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingCaseFile(false);
    }
  };

  const showSection = (sec: string) => activeTab === "all" || activeTab === sec;

  return (
    <div className="space-y-8 pb-12 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fp-text">Admin Settings</h2>
        <p className="text-sm text-fp-text-muted mt-1">Case settings, roster, organization team, and audit trail</p>
      </div>

      {errorFlash && (
        <div className="rounded-lg border border-fp-red/30 bg-fp-red/5 p-3 text-sm text-fp-red flex items-center justify-between gap-3">
          <span>{errorFlash}</span>
          <button onClick={() => setErrorFlash(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Quick Navigation Filter Bar */}
      <div className="flex items-center gap-2 border-b border-fp-border pb-4 flex-wrap">
        {[
          { id: "all" as const, label: "All Sections", icon: Settings },
          { id: "general" as const, label: "General", icon: Settings },
          { id: "roster" as const, label: "Case Roster", icon: Users },
          { id: "organization" as const, label: "Organization", icon: Building2 },
          { id: "permissions" as const, label: "Roles", icon: Shield },
          { id: "audit" as const, label: "Audit Log", icon: History },
          { id: "danger" as const, label: "Danger Zone", icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

      {showSection("general") && <section className="rounded-xl surface-flat p-6 space-y-3">
        <h3 className="text-base font-semibold">Portable case file</h3>
        <p className="text-sm text-fp-text-muted">Download the case record and evidence files to reopen as a separate case. Imported mailing approvals require a new review.</p>
        <button onClick={downloadCaseFile} disabled={exportingCaseFile} className="inline-flex items-center gap-2 rounded-lg bg-fp-blue px-4 py-2 text-sm text-white disabled:opacity-50">
          {exportingCaseFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Download case file
        </button>
      </section>}

      {/* SECTION: GENERAL */}
      {showSection("general") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Settings className="w-5 h-5 text-fp-blue" />
              General
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim">Case preferences</span>
          </div>

          {settingsLoading ? (
            <div className="flex items-center gap-2 text-sm text-fp-text-dim py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="rounded-xl surface-flat p-6 space-y-6">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">Description</label>
                <textarea
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:border-fp-blue focus:outline-none focus:ring-1 focus:ring-fp-blue transition-all min-h-[90px] leading-relaxed"
                  placeholder="Brief summary or case objective"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">Jurisdiction</label>
                  <input
                    value={settings.jurisdiction}
                    onChange={(e) => setSettings({ ...settings, jurisdiction: e.target.value })}
                    className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">Auto-Expire Permit Window (Days)</label>
                  <input
                    type="number"
                    value={settings.auto_expire_days}
                    onChange={(e) => setSettings({ ...settings, auto_expire_days: parseInt(e.target.value) || 180 })}
                    className="w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none font-mono transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-fp-border space-y-3">
                <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider">Notifications</h4>
                {[
                  { key: "notify_deadlines" as const, label: "Statutory Deadline Alerts", desc: "Get notified when statutory due process deadlines or permit expiration dates approach." },
                  { key: "notify_enforcement" as const, label: "Enforcement Case Updates", desc: "Receive notifications when new code enforcement filings are detected." },
                  { key: "notify_permit_changes" as const, label: "Permit Status Changes", desc: "Notify on permit status updates, inspection schedule changes, or new approvals." },
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

              <div className="flex justify-end pt-2">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFlash ? <Check className="h-4 w-4" /> : null}
                  {saving ? "Saving…" : savedFlash ? "Saved!" : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION: CASE ROSTER */}
      {showSection("roster") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Users className="w-5 h-5 text-fp-blue" />
              Case Roster
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim">({roster.length})</span>
          </div>

          <div className="rounded-xl surface-flat p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-fp-text-muted">
                Attorneys, property owners, witnesses, and others associated with this case. This is a roster for reference —
                it does <strong>not</strong> grant login access to the app.
              </p>
              <button
                onClick={() => setShowInviteRoster(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-all shadow-md shrink-0"
              >
                <Plus className="h-4 w-4" />
                Add to Roster
              </button>
            </div>

            {rosterLoading ? (
              <div className="flex items-center gap-2 text-sm text-fp-text-dim py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : roster.length === 0 ? (
              <p className="text-sm text-fp-text-dim text-center py-6">No one on the roster yet</p>
            ) : (
              <div className="space-y-3">
                {roster.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 rounded-xl border border-fp-border bg-fp-surface-2/60 p-4 transition-all hover:border-fp-border-hover">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fp-blue/15 border border-fp-blue/30 text-sm font-semibold text-fp-blue shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-fp-text truncate">{m.name}</span>
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md border bg-fp-surface-2 text-fp-text-dim border-fp-border">{m.role}</span>
                        </div>
                        <p className="text-xs text-fp-text-dim truncate mt-0.5">{m.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeRosterMember(m.id)}
                      className="p-2 text-fp-text-muted hover:text-fp-red hover:bg-fp-red/10 rounded-lg transition-colors"
                      title="Remove from roster"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION: ORGANIZATION */}
      {showSection("organization") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Building2 className="w-5 h-5 text-fp-blue" />
              Organization
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Team &amp; identity</span>
          </div>

          {!isOrgAdmin ? (
            <div className="rounded-xl surface-flat p-6 flex items-center gap-3 text-sm text-fp-text-muted">
              <Lock className="w-4 h-4 text-fp-text-dim shrink-0" />
              Organization management is limited to admins. Ask an admin on your team for changes here.
            </div>
          ) : orgLoading ? (
            <div className="flex items-center gap-2 text-sm text-fp-text-dim py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="rounded-xl surface-flat p-6 space-y-6">
              {org && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-2 block">Organization Name</label>
                  <OrgNameEditor name={org.name} onSave={saveOrgName} />
                  <p className="text-[11px] text-fp-text-dim mt-1">{orgMembers.filter(m => m.status === "active").length} active member(s) · created {new Date(org.created_at).toLocaleDateString()}</p>
                </div>
              )}

              <div className="pt-4 border-t border-fp-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider">Team ({orgMembers.length})</h4>
                  <button
                    onClick={() => setShowInviteOrgMember(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Invite Teammate
                  </button>
                </div>

                {lastTempPassword && (
                  <div className="mb-3 p-3 rounded-lg border border-fp-amber/30 bg-fp-amber/5 text-xs space-y-1">
                    <p className="text-fp-amber font-medium">Share this temporary password with {lastTempPassword.email} securely (there's no email delivery yet):</p>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 rounded bg-fp-surface-2 text-fp-text font-mono">{lastTempPassword.password}</code>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(lastTempPassword.password); }}
                        className="p-1.5 rounded hover:bg-fp-surface-2 text-fp-text-dim hover:text-fp-text"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setLastTempPassword(null)} className="ml-auto text-fp-text-dim hover:text-fp-text"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <p className="text-fp-text-dim">This is shown once and not stored anywhere.</p>
                  </div>
                )}

                <div className="space-y-2">
                  {orgMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-fp-border bg-fp-surface-2/60 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fp-text truncate">{m.name}</span>
                          {m.status !== "active" && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-fp-red/15 text-fp-red">{m.status}</span>
                          )}
                        </div>
                        <p className="text-xs text-fp-text-dim truncate">{m.email}</p>
                      </div>
                      <select
                        value={m.role}
                        onChange={(e) => updateOrgMember(m.id, { role: e.target.value as OrgRole })}
                        disabled={m.user_id === user?.id}
                        className="rounded-lg bg-fp-surface border border-fp-border px-2 py-1.5 text-xs text-fp-text focus:outline-none focus:border-fp-blue disabled:opacity-50"
                        title={m.user_id === user?.id ? "You can't change your own role — ask another admin" : "Change role"}
                      >
                        {ORG_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {m.status === "active" ? (
                        <button
                          onClick={() => updateOrgMember(m.id, { status: "suspended" })}
                          disabled={m.user_id === user?.id}
                          className="p-1.5 text-fp-text-muted hover:text-fp-red hover:bg-fp-red/10 rounded-lg transition-colors disabled:opacity-30"
                          title={m.user_id === user?.id ? "You can't suspend yourself" : "Suspend"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => updateOrgMember(m.id, { status: "active" })}
                          className="p-1.5 text-fp-text-muted hover:text-fp-green hover:bg-fp-green/10 rounded-lg transition-colors"
                          title="Reactivate"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION: PERMISSIONS (real role reference — read only) */}
      {showSection("permissions") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <Shield className="w-5 h-5 text-fp-blue" />
              Roles
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">What each role can do</span>
          </div>
          <div className="rounded-xl surface-flat p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ORG_ROLES.map((r) => (
                <div key={r} className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border">
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md border bg-fp-surface-2 text-fp-text-dim border-fp-border">{r}</span>
                  <p className="text-xs text-fp-text-muted mt-1.5">{ORG_ROLE_DESCRIPTIONS[r]}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-fp-text-dim mt-4">Roles are assigned per organization member in the Organization tab (admins only).</p>
          </div>
        </section>
      )}

      {/* SECTION: AUDIT LOG */}
      {showSection("audit") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-text flex items-center gap-2">
              <History className="w-5 h-5 text-fp-blue" />
              Audit Log
            </h3>
            <span className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Append-only</span>
          </div>

          {!isOrgAdmin ? (
            <div className="rounded-xl surface-flat p-6 flex items-center gap-3 text-sm text-fp-text-muted">
              <Lock className="w-4 h-4 text-fp-text-dim shrink-0" />
              The audit log is limited to admins.
            </div>
          ) : (
            <div className="rounded-xl surface-flat p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim" />
                <input
                  placeholder="Search actions, resources…"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") fetchAuditLogs(); }}
                  className="w-full rounded-lg bg-fp-surface-2 border border-fp-border pl-9 pr-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue"
                />
              </div>

              {auditLoading ? (
                <div className="flex items-center gap-2 text-sm text-fp-text-dim py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : auditLogs.length === 0 ? (
                <p className="text-sm text-fp-text-dim text-center py-6">No audit log entries yet</p>
              ) : (
                <div className="rounded-xl border border-fp-border overflow-hidden max-h-[420px] overflow-y-auto">
                  {auditLogs.map((log, i) => (
                    <div key={log.id} className={`px-4 py-3 ${i > 0 ? "border-t border-fp-border" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-fp-text">{log.action}</span>
                        {log.resource_type && (
                          <span className="text-xs text-fp-text-dim">· {log.resource_type}{log.resource_id && `: ${log.resource_id.slice(0, 8)}`}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-fp-text-dim">
                        {log.actor_name && <span>by {log.actor_name} ({log.actor_type})</span>}
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      {log.details && (
                        <div className="mt-1 text-xs text-fp-text-dim bg-fp-surface-2 rounded px-2 py-1 font-mono truncate">{log.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* SECTION: DANGER ZONE */}
      {showSection("danger") && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fp-red flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-fp-red" />
              Danger Zone
            </h3>
          </div>

          <div className="rounded-xl bg-fp-red/5 border border-fp-red/40 p-6 shadow-lg shadow-black/20 space-y-4">
            <div>
              <h4 className="text-base font-semibold text-fp-text flex items-center gap-2"><Archive className="w-4 h-4" /> Archive Case</h4>
              <p className="text-sm text-fp-text-muted mt-1 leading-relaxed">
                Archiving marks this case closed and out of active work. Nothing is deleted — evidence, timeline, findings,
                and permits/enforcement records all stay intact, and the case can be reopened at any time. This app never
                permanently deletes case data.
              </p>
            </div>

            {!showArchiveConfirm ? (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-fp-red/40 bg-fp-red/10 text-xs font-medium text-fp-red hover:bg-fp-red/20 transition-all"
              >
                <Archive className="h-4 w-4" />
                Archive This Case
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-fp-red/10 border border-fp-red/30 space-y-3">
                <p className="text-sm font-semibold text-fp-red">Archive this case?</p>
                <p className="text-xs text-fp-text-muted">You can reopen it later from this same tab.</p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => setShowArchiveConfirm(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-fp-border bg-fp-surface-2 text-xs font-medium text-fp-text hover:bg-fp-surface-2/80 transition-colors"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                  <button
                    onClick={() => setProjectArchived(true)}
                    disabled={archiving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fp-red text-white text-xs font-medium hover:bg-fp-red/90 transition-all shadow-md disabled:opacity-50"
                  >
                    {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Yes, Archive
                  </button>
                </div>
              </div>
            )}

            {projectStatus === "archived" && (
              <button
                onClick={() => setProjectArchived(false)}
                disabled={archiving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-fp-border bg-fp-surface-2 text-xs font-medium text-fp-text hover:bg-fp-surface-2/80 transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                Reopen Case
              </button>
            )}
          </div>
        </section>
      )}

      {/* Add to Roster Modal */}
      {showInviteRoster && (
        <RosterModal
          onClose={() => setShowInviteRoster(false)}
          onSubmit={async (email, name, role) => { await addRosterMember(email, name, role); setShowInviteRoster(false); }}
        />
      )}

      {/* Invite Org Member Modal */}
      {showInviteOrgMember && (
        <OrgInviteModal
          onClose={() => setShowInviteOrgMember(false)}
          onSubmit={async (email, name, role) => { await inviteOrgMember(email, name, role); setShowInviteOrgMember(false); }}
        />
      )}
    </div>
  );
}

// ── Org name inline editor ──
function OrgNameEditor({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(name), [name]);
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text focus:border-fp-blue focus:outline-none transition-all"
      />
      <button
        onClick={async () => { setSaving(true); try { await onSave(value); } finally { setSaving(false); } }}
        disabled={saving || value === name || !value.trim()}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 disabled:opacity-40 transition-all"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Save
      </button>
    </div>
  );
}

// ── Add to roster modal ──
function RosterModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string, name: string, role: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(email.trim(), name.trim() || email.split("@")[0], role);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Add to Case Roster">
      <div className="space-y-4">
        <p className="text-xs text-fp-text-dim">This adds a reference entry (e.g. an attorney or property owner) — it does not create a login.</p>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" /></Field>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@example.com" /></Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {error && <p className="text-xs text-fp-red">{error}</p>}
        <button onClick={submit} disabled={saving} className={submitCls}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add to Roster
        </button>
      </div>
    </Modal>
  );
}

// ── Invite org member modal ──
function OrgInviteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string, name: string, role: OrgRole) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<OrgRole>("investigator");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !name.trim()) { setError("Name and email are required"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(email.trim(), name.trim(), role);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Invite Teammate">
      <div className="space-y-4">
        <p className="text-xs text-fp-text-dim">This creates a real account (or adds an existing one) with login access to your organization.</p>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" /></Field>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@example.com" /></Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className={inputCls}>
            {ORG_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <p className="text-[11px] text-fp-text-dim mt-1">{ORG_ROLE_DESCRIPTIONS[role]}</p>
        </Field>
        {error && <p className="text-xs text-fp-red">{error}</p>}
        <button onClick={submit} disabled={saving} className={submitCls}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Send Invite
        </button>
      </div>
    </Modal>
  );
}

const inputCls = "w-full rounded-lg border border-fp-border bg-fp-surface px-4 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim focus:border-fp-blue focus:outline-none transition-all";
const submitCls = "w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-md mt-2 disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-fp-text-dim mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose} role="button" tabIndex={0} aria-label="Close modal">
      <div className="w-full max-w-md rounded-xl glass p-6 shadow-2xl shadow-black/50 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-fp-border">
          <h3 className="text-base font-semibold text-fp-text">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
