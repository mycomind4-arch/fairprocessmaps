/**
 * FairProcess — Admin API Layer
 * API functions for the identity & admin platform.
 * Matches the existing api.ts pattern (fetch-based, typed).
 */

import type {
  Organization,
  OrganizationMember,
  Case,
  Role,
  Permission,
  RolePermission,
  Feature,
  OrganizationFeature,
  AuditLog,
  SystemEvent,
  UserProfile,
  Notification,
} from "../types/identity";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: { detail?: string } = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const adminApi = {
  // ── Organizations ──
  organizations: {
    list(): Promise<Organization[]> {
      return request("/api/v1/admin/organizations");
    },
    get(id: string): Promise<Organization> {
      return request(`/api/v1/admin/organizations/${id}`);
    },
    create(data: { name: string; slug: string; org_type: string }): Promise<Organization> {
      return request("/api/v1/admin/organizations", { method: "POST", body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Organization>): Promise<Organization> {
      return request(`/api/v1/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    members(orgId: string): Promise<OrganizationMember[]> {
      return request(`/api/v1/admin/organizations/${orgId}/members`);
    },
    inviteMember(orgId: string, data: { email: string; role: string }): Promise<OrganizationMember> {
      return request(`/api/v1/admin/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify(data) });
    },
    updateMember(orgId: string, memberId: string, data: { role: string; status: string }): Promise<OrganizationMember> {
      return request(`/api/v1/admin/organizations/${orgId}/members/${memberId}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    removeMember(orgId: string, memberId: string): Promise<void> {
      return request(`/api/v1/admin/organizations/${orgId}/members/${memberId}`, { method: "DELETE" });
    },
  },

  // ── Cases ──
  cases: {
    list(orgId: string, params?: { status?: string; limit?: number }): Promise<Case[]> {
      const qs = new URLSearchParams();
      if (params) for (const [k, v] of Object.entries(params)) if (v != null) qs.append(k, String(v));
      return request(`/api/v1/admin/organizations/${orgId}/cases?${qs}`);
    },
    create(orgId: string, data: { name: string; case_type: string; description?: string }): Promise<Case> {
      return request(`/api/v1/admin/organizations/${orgId}/cases`, { method: "POST", body: JSON.stringify(data) });
    },
  },

  // ── Roles & Permissions ──
  roles: {
    list(): Promise<Role[]> {
      return request("/api/v1/admin/roles");
    },
    permissions(): Promise<Permission[]> {
      return request("/api/v1/admin/permissions");
    },
    rolePermissions(roleId: string): Promise<RolePermission[]> {
      return request(`/api/v1/admin/roles/${roleId}/permissions`);
    },
    updatePermissions(roleId: string, permissionIds: string[]): Promise<void> {
      return request(`/api/v1/admin/roles/${roleId}/permissions`, { method: "PUT", body: JSON.stringify({ permission_ids: permissionIds }) });
    },
  },

  // ── Features ──
  features: {
    list(): Promise<Feature[]> {
      return request("/api/v1/admin/features");
    },
    orgFeatures(orgId: string): Promise<OrganizationFeature[]> {
      return request(`/api/v1/admin/organizations/${orgId}/features`);
    },
    toggle(orgId: string, featureId: string, enabled: boolean): Promise<void> {
      return request(`/api/v1/admin/organizations/${orgId}/features`, {
        method: enabled ? "POST" : "DELETE",
        body: JSON.stringify({ feature_id: featureId }),
      });
    },
  },

  // ── Audit Logs ──
  auditLogs: {
    list(params?: {
      org_id?: string;
      case_id?: string;
      actor_type?: string;
      action?: string;
      limit?: number;
      offset?: number;
    }): Promise<AuditLog[]> {
      const qs = new URLSearchParams();
      if (params) for (const [k, v] of Object.entries(params)) if (v != null) qs.append(k, String(v));
      return request(`/api/v1/admin/audit-logs?${qs}`);
    },
  },

  // ── System Events ──
  systemEvents: {
    list(params?: {
      category?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    }): Promise<SystemEvent[]> {
      const qs = new URLSearchParams();
      if (params) for (const [k, v] of Object.entries(params)) if (v != null) qs.append(k, String(v));
      return request(`/api/v1/admin/system-events?${qs}`);
    },
  },

  // ── Notifications ──
  notifications: {
    list(): Promise<Notification[]> {
      return request("/api/v1/admin/notifications");
    },
    markRead(id: string): Promise<void> {
      return request(`/api/v1/admin/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
    },
  },
};
