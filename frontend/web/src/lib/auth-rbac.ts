// @ts-nocheck — frozen reference from Supabase architecture (ADR-002), not used in Cloudflare stack (ADR-006)
/**
 * FairProcess — Permission & Authorization Middleware
 * Checks user permissions against the database-backed permission registry.
 * Uses Supabase Auth for authentication, then checks org membership + role permissions.
 */

import { createClient } from '@supabase/supabase-js';
import type { UserContext, MemberRole } from './types/identity';

// ── Permission check helper ──
export function hasPermission(ctx: UserContext | null, permission: string): boolean {
  if (!ctx) return false;
  if (ctx.permissions.includes('system.admin')) return true;
  return ctx.permissions.includes(permission);
}

export function hasAnyPermission(ctx: UserContext | null, ...permissions: string[]): boolean {
  if (!ctx) return false;
  if (ctx.permissions.includes('system.admin')) return true;
  return permissions.some((p) => ctx.permissions.includes(p));
}

export function hasAllPermissions(ctx: UserContext | null, ...permissions: string[]): boolean {
  if (!ctx) return false;
  if (ctx.permissions.includes('system.admin')) return true;
  return permissions.every((p) => ctx.permissions.includes(p));
}

// ── Feature gate helper ──
export function hasFeature(ctx: UserContext | null, featureCode: string): boolean {
  if (!ctx) return false;
  return ctx.enabled_features.includes(featureCode);
}

// ── Org role check ──
export function hasOrgRole(ctx: UserContext | null, orgId: string, ...roles: MemberRole[]): boolean {
  if (!ctx) return false;
  const membership = ctx.organizations.find((m) => m.organization.id === orgId && m.is_active);
  if (!membership) return false;
  return roles.includes(membership.role);
}

// ── Build user context from Supabase session ──
export async function buildUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  activeOrgId?: string
): Promise<UserContext | null> {
  // 1. Get user's auth data
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser?.user || authUser.user.id !== userId) return null;

  // 2. Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  // 3. Get organization memberships
  const { data: memberships } = await supabase
    .from('organization_members')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!memberships || memberships.length === 0) {
    return {
      user_id: userId,
      email: authUser.user.email || null,
      display_name: profile?.display_name || authUser.user.email?.split('@')[0] || null,
      avatar_url: profile?.avatar_url || null,
      organizations: [],
      active_organization_id: null,
      permissions: [],
      enabled_features: [],
      roles: [],
    };
  }

  // 4. Determine active org (from param, or first membership, or last used)
  const activeOrg = activeOrgId
    ? memberships.find((m) => m.organization_id === activeOrgId)
    : memberships[0];

  if (!activeOrg) return null;

  const orgId = activeOrg.organization_id;
  const userRole = activeOrg.role as MemberRole;

  // 5. Get permissions for this role
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permission:permissions(code)')
    .eq('role_id', `role-${userRole.replace('_', '-')}`);

  const permissions = (rolePerms || [])
    .map((rp: any) => rp.permission?.code)
    .filter(Boolean) as string[];

  // 6. Get enabled features for this org
  const { data: orgFeatures } = await supabase
    .from('organization_features')
    .select('feature:features(code)')
    .eq('organization_id', orgId);

  const enabledFeatures = (orgFeatures || [])
    .map((of: any) => of.feature?.code)
    .filter(Boolean) as string[];

  // Also add default features
  const { data: defaultFeatures } = await supabase
    .from('features')
    .select('code')
    .eq('is_default', 1);

  const defaultFeatureCodes = (defaultFeatures || []).map((f: any) => f.code);
  const allFeatures = [...new Set([...enabledFeatures, ...defaultFeatureCodes])];

  // 7. Build membership list
  const orgMemberships = memberships.map((m: any) => ({
    organization: m.organization,
    role: m.role as MemberRole,
    status: m.status as any,
    is_active: m.status === 'active',
  }));

  return {
    user_id: userId,
    email: authUser.user.email || null,
    display_name: profile?.display_name || authUser.user.email?.split('@')[0] || null,
    avatar_url: profile?.avatar_url || null,
    organizations: orgMemberships,
    active_organization_id: orgId,
    permissions,
    enabled_features: allFeatures,
    roles: [userRole],
  };
}

// ── Audit log helper (call after any auditable action) ──
export async function writeAuditLog(
  supabase: ReturnType<typeof createClient>,
  entry: {
    organization_id?: string;
    case_id?: string;
    actor_type: 'user' | 'ai_agent' | 'system' | 'scraper';
    actor_id?: string;
    actor_name?: string;
    action: string;
    resource_type?: string;
    resource_id?: string;
    resource_name?: string;
    details?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
  }
): Promise<void> {
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: entry.organization_id || null,
    case_id: entry.case_id || null,
    actor_type: entry.actor_type,
    actor_id: entry.actor_id || null,
    actor_name: entry.actor_name || null,
    action: entry.action,
    resource_type: entry.resource_type || null,
    resource_id: entry.resource_id || null,
    resource_name: entry.resource_name || null,
    details: entry.details ? JSON.stringify(entry.details) : null,
    ip_address: entry.ip_address || null,
    user_agent: entry.user_agent || null,
  });
}

// ── System event helper ──
export async function writeSystemEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    event_category: 'user' | 'ai_agent' | 'scraper' | 'import_export' | 'workflow' | 'system_health' | 'security';
    event_type: string;
    severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    source?: string;
    message: string;
    details?: Record<string, unknown>;
    organization_id?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('system_events').insert({
    id: crypto.randomUUID(),
    event_category: event.event_category,
    event_type: event.event_type,
    severity: event.severity || 'info',
    source: event.source || null,
    message: event.message,
    details: event.details ? JSON.stringify(event.details) : null,
    organization_id: event.organization_id || null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  });
}
