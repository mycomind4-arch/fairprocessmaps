/**
 * FairProcess — Identity & Administration Platform Types
 * Generated for migration 004_identity_platform
 * DO NOT import from existing types.ts — this is a standalone module
 * that can be merged later when the team is ready.
 */

// ── Organization ──
export type OrgType = 'individual' | 'law_firm' | 'property_owner' | 'hoa' | 'consulting_firm' | 'county' | 'city' | 'engineering_firm' | 'other';
export type OrgStatus = 'active' | 'suspended' | 'deleted';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  status: OrgStatus;
  parent_org_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Organization Membership ──
export type MemberRole = 'org_owner' | 'admin' | 'manager' | 'investigator' | 'analyst' | 'viewer' | 'guest' | 'property_owner' | 'attorney' | 'consultant' | 'expert_witness';
export type MemberStatus = 'active' | 'invited' | 'suspended';

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string;
  updated_at: string;
}

// ── Cases (first-class entity) ──
export type CaseType = 'code_enforcement' | 'building_permit' | 'appeal' | 'due_process' | 'property_dispute' | 'compliance' | 'other';
export type CaseStatus = 'open' | 'investigating' | 'in_review' | 'hearing' | 'closed' | 'archived';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Case {
  id: string;
  organization_id: string;
  name: string;
  case_number: string | null;
  case_type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

// ── Roles ──
export type RoleScope = 'system' | 'organization';

export interface Role {
  id: string;
  name: string;
  display_name: string;
  scope: RoleScope;
  description: string | null;
  is_system_role: boolean;
  created_at: string;
}

// ── Permissions ──
export type PermissionCategory = 'properties' | 'cases' | 'evidence' | 'timeline' | 'permits' | 'code_enforcement' | 'mail' | 'ai' | 'admin' | 'audit' | 'apikeys';

export interface Permission {
  id: string;
  code: string;
  category: PermissionCategory;
  description: string | null;
  created_at: string;
}

// ── Role-Permission Mapping ──
export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

// ── Feature Registry ──
export type FeatureCategory = 'core' | 'recon' | 'advanced' | 'integrations' | 'ai';

export interface Feature {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: FeatureCategory;
  is_default: boolean;
  is_pilot: boolean;
  created_at: string;
}

export interface OrganizationFeature {
  id: string;
  organization_id: string;
  feature_id: string;
  enabled_at: string;
  enabled_by: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Audit Logs (append-only) ──
export type AuditActorType = 'user' | 'ai_agent' | 'system' | 'scraper';

export interface AuditLog {
  id: string;
  organization_id: string | null;
  case_id: string | null;
  actor_type: AuditActorType;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ── System Events ──
export type EventCategory = 'user' | 'ai_agent' | 'scraper' | 'import_export' | 'workflow' | 'system_health' | 'security';
export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface SystemEvent {
  id: string;
  event_category: EventCategory;
  event_type: string;
  severity: EventSeverity;
  source: string | null;
  message: string;
  details: Record<string, unknown> | null;
  organization_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── AI Agents ──
export type AgentType = 'ingestion' | 'analysis' | 'extraction' | 'monitoring' | 'report' | 'custom';
export type AgentStatus = 'registered' | 'active' | 'paused' | 'disabled';

export interface AIAgent {
  id: string;
  name: string;
  agent_type: AgentType;
  description: string | null;
  organization_id: string | null;
  status: AgentStatus;
  allowed_data_sources: string[] | null;
  allowed_actions: string[] | null;
  rate_limit_per_min: number;
  rate_limit_per_hour: number;
  max_concurrent: number;
  api_key_hash: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── API Keys ──
export interface ApiKey {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  is_revoked: boolean;
  revoked_at: string | null;
  created_at: string;
}

// ── User Profile ──
export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  phone: string | null;
  avatar_url: string | null;
  timezone: string;
  notification_prefs: Record<string, boolean> | null;
  saved_searches: SavedSearch[] | null;
  saved_map_views: SavedMapView[] | null;
  recent_activity: RecentActivity[] | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export interface SavedMapView {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  layers: string[];
  created_at: string;
}

export interface RecentActivity {
  action: string;
  resource_type: string;
  resource_id: string;
  timestamp: string;
}

// ── Notifications ──
export type NotificationCategory = 'ai_job' | 'evidence' | 'discrepancy' | 'county_update' | 'hearing_reminder' | 'permit_change' | 'code_enforcement' | 'team_mention' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  organization_id: string | null;
  case_id: string | null;
  category: NotificationCategory;
  title: string;
  message: string | null;
  is_read: boolean;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Case-Project Junction ──
export interface CaseProject {
  id: string;
  case_id: string;
  project_id: string;
  role: string;
  linked_at: string;
}

// ── Convenience: Full user context (what the API returns after auth) ──
export interface UserContext {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  organizations: OrganizationMembership[];
  active_organization_id: string | null;
  permissions: string[];
  enabled_features: string[];
  roles: string[];
}

export interface OrganizationMembership {
  organization: Organization;
  role: MemberRole;
  status: MemberStatus;
  is_active: boolean;
}
