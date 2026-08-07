"use client";

import { useState, useEffect } from "react";
import {
  Users, UserPlus, Search, Loader2, Trash2, Shield, Mail,
  Check, X, Crown, UserCog, Eye
} from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { OrganizationMember } from "@/lib/types/identity";

const ROLE_ICONS: Record<string, typeof Crown> = {
  org_owner: Crown,
  admin: UserCog,
  manager: UserCog,
  investigator: Users,
  analyst: Eye,
  viewer: Eye,
  guest: Eye,
  attorney: Shield,
  property_owner: Users,
  consultant: Users,
  expert_witness: Shield,
};

const ROLE_LABELS: Record<string, string> = {
  org_owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  investigator: "Investigator",
  analyst: "Analyst",
  viewer: "Viewer",
  guest: "Guest",
  attorney: "Attorney",
  property_owner: "Property Owner",
  consultant: "Consultant",
  expert_witness: "Expert Witness",
};

const ALL_ROLES = ["org_owner", "admin", "manager", "investigator", "analyst", "viewer", "guest", "attorney", "property_owner", "consultant", "expert_witness"];

interface UserManagementProps {
  orgId: string;
}

export function UserManagement({ orgId }: UserManagementProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [orgId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await adminApi.organizations.members(orgId);
      setMembers(data);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await adminApi.organizations.inviteMember(orgId, { email: inviteEmail, role: inviteRole });
      setShowInvite(false);
      setInviteEmail("");
      await loadMembers();
    } catch (e) {
      console.error("Invite failed:", e);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      await adminApi.organizations.updateMember(orgId, memberId, { role: newRole, status: "active" });
      await loadMembers();
    } catch (e) {
      console.error("Role change failed:", e);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await adminApi.organizations.removeMember(orgId, memberId);
      await loadMembers();
    } catch (e) {
      console.error("Remove failed:", e);
    }
  };

  const filtered = members.filter((m) => {
    if (!search) return true;
    return m.user_id.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-fp-cyan" />
          <h3 className="text-sm font-semibold text-fp-text">Members ({members.length})</h3>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:shadow-lg hover:shadow-fp-blue/20 transition-all"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Invite
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border border-fp-border bg-fp-surface p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-fp-text-muted">
            <Mail className="w-3.5 h-3.5" />
            Invite a new member
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg bg-fp-surface-2 border border-fp-border px-3 py-2 text-sm text-fp-text focus:outline-none focus:border-fp-blue"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting}
              className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="px-3 py-2 rounded-lg bg-fp-surface-2 text-fp-text-muted hover:text-fp-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fp-text-dim" />
        <input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-fp-surface-2 border border-fp-border pl-9 pr-3 py-2 text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue"
        />
      </div>

      {/* Member list */}
      <div className="rounded-xl border border-fp-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-fp-text-dim">No members found</div>
        ) : (
          filtered.map((member, i) => {
            const RoleIcon = ROLE_ICONS[member.role] || Users;
            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-fp-surface-2 transition-colors ${i > 0 ? "border-t border-fp-border" : ""}`}
              >
                <div className="w-9 h-9 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0">
                  <RoleIcon className="w-4 h-4 text-fp-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-text truncate">{member.user_id}</div>
                  <div className="text-xs text-fp-text-dim">
                    {ROLE_LABELS[member.role] || member.role} · {member.status}
                  </div>
                </div>
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="rounded-lg bg-fp-surface-2 border border-fp-border px-2 py-1 text-xs text-fp-text focus:outline-none focus:border-fp-blue"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemove(member.id)}
                  className="p-2 rounded-lg text-fp-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
