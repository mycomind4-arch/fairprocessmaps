"use client";

import { useState, useEffect } from "react";
import { Shield, Check, Loader2, Lock } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { Role, Permission } from "@/lib/types/identity";

const ROLE_COLORS: Record<string, string> = {
  system: "text-fp-cyan",
  organization: "text-fp-text",
};

interface RolePermissionsProps {
  // No props needed — loads global roles & permissions
}

export function RolePermissions({}: RolePermissionsProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([
        adminApi.roles.list(),
        adminApi.roles.permissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);

      // Load permissions for each role
      const matrixData: Record<string, Set<string>> = {};
      await Promise.all(
        rolesData.map(async (role) => {
          try {
            const rolePerms = await adminApi.roles.rolePermissions(role.id);
            matrixData[role.id] = new Set(rolePerms.map((rp) => rp.permission_id));
          } catch {
            matrixData[role.id] = new Set();
          }
        })
      );
      setMatrix(matrixData);
    } catch {
      // Fall back to seed data from migration
      setRoles([]);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (roleId: string, permId: string) => {
    const current = new Set(matrix[roleId] || []);
    if (current.has(permId)) {
      current.delete(permId);
    } else {
      current.add(permId);
    }
    setMatrix({ ...matrix, [roleId]: current });

    setSaving(roleId);
    try {
      await adminApi.roles.updatePermissions(roleId, [...current]);
    } catch {
      // Revert on error
      await loadData();
    } finally {
      setSaving(null);
    }
  };

  // Group permissions by category
  const categories = [...new Set(permissions.map((p) => p.category))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-fp-cyan" />
        <h3 className="text-sm font-semibold text-fp-text">Role-Permission Matrix</h3>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border border-fp-border bg-fp-surface p-6 text-center">
          <Lock className="w-8 h-8 text-fp-text-dim mx-auto mb-2" />
          <p className="text-sm text-fp-text-muted">
            Run migration 004 to initialize roles and permissions.
          </p>
          <code className="mt-2 inline-block text-xs text-fp-cyan bg-fp-surface-2 px-3 py-1 rounded-lg">
            wrangler d1 execute fairprocess --file=database/d1/migrations/004_identity_platform.sql
          </code>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-fp-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-fp-surface-2">
                <th className="text-left px-3 py-2.5 font-medium text-fp-text-muted sticky left-0 bg-fp-surface-2 z-10">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.id} className="px-2 py-2.5 font-medium text-center min-w-[80px]">
                    <div className={`text-[10px] ${ROLE_COLORS[role.scope] || ""}`}>
                      {role.scope === "system" && <Lock className="w-2.5 h-2.5 inline mr-0.5" />}
                      {role.display_name}
                      {saving === role.id && <Loader2 className="w-2.5 h-2.5 inline ml-1 animate-spin" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <>
                  <tr key={`cat-${cat}`} className="bg-fp-surface">
                    <td colSpan={roles.length + 1} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fp-text-dim">
                      {cat.replace(/_/g, " ")}
                    </td>
                  </tr>
                  {permissions
                    .filter((p) => p.category === cat)
                    .map((perm) => (
                      <tr key={perm.id} className="hover:bg-fp-surface-2 border-t border-fp-border">
                        <td className="px-3 py-2 text-fp-text">
                          <div className="font-mono text-[11px]">{perm.code}</div>
                          <div className="text-[10px] text-fp-text-dim">{perm.description}</div>
                        </td>
                        {roles.map((role) => {
                          const has = matrix[role.id]?.has(perm.id);
                          return (
                            <td key={`${role.id}-${perm.id}`} className="text-center">
                              <button
                                onClick={() => togglePermission(role.id, perm.id)}
                                className={`w-5 h-5 rounded-md inline-flex items-center justify-center transition-all ${
                                  has
                                    ? "bg-fp-blue text-white"
                                    : "bg-fp-surface-3 text-fp-text-dim hover:bg-fp-surface-2"
                                }`}
                              >
                                {has && <Check className="w-3 h-3" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
