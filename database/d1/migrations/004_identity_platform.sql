-- Migration 004: Identity & Administration Platform
-- Adds: Organizations, Cases, RBAC, Permissions, Feature Registry, Audit Logs, System Events, AI Agents, API Keys
-- This migration is purely ADDITIVE — no existing tables are modified or dropped.
-- Existing projects continue to work; they can optionally be linked to cases via case_projects junction.

-- ═══════════════════════════════════════════════════════════════
-- ORGANIZATIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  org_type TEXT NOT NULL DEFAULT 'individual',
  status TEXT NOT NULL DEFAULT 'active',
  parent_org_id TEXT REFERENCES organizations(id),
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_type ON organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_org_status ON organizations(status);

-- ═══════════════════════════════════════════════════════════════
-- ORGANIZATION MEMBERS (junction: users ↔ orgs with roles)
-- user_id maps to Supabase Auth user ID (auth.uid)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by TEXT,
  invited_at TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orgmember_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_orgmember_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_orgmember_role ON organization_members(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgmember_unique ON organization_members(organization_id, user_id);

-- ═══════════════════════════════════════════════════════════════
-- CASES (first-class entity — container for properties, evidence, timeline, findings)
-- Replaces the conceptual role of "projects" but does NOT modify the projects table.
-- Existing projects can be linked to cases via the case_projects junction.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  case_number TEXT,
  case_type TEXT NOT NULL DEFAULT 'code_enforcement',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  description TEXT,
  assigned_to TEXT,
  due_date TEXT,
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_org_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);

-- Junction: cases ↔ existing projects (link without modifying projects table)
CREATE TABLE IF NOT EXISTS case_projects (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'primary',
  linked_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_caseproj_case_id ON case_projects(case_id);
CREATE INDEX IF NOT EXISTS idx_caseproj_project_id ON case_projects(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caseproj_unique ON case_projects(case_id, project_id);

-- ═══════════════════════════════════════════════════════════════
-- ROLES (system-level and org-level role definitions)
-- scope: 'system' (platform-wide) or 'organization' (org-specific)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  scope TEXT NOT NULL DEFAULT 'organization',
  description TEXT,
  is_system_role INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- Seed system roles
INSERT OR IGNORE INTO roles (id, name, display_name, scope, description, is_system_role) VALUES
  ('role-super-admin', 'super_admin', 'Super Admin', 'system', 'Full platform access including all orgs', 1),
  ('role-platform-admin', 'platform_admin', 'Platform Admin', 'system', 'Platform administration, support, and ops', 1),
  ('role-support', 'support', 'Support', 'system', 'Read-only access for support and troubleshooting', 1);

-- Seed organization roles
INSERT OR IGNORE INTO roles (id, name, display_name, scope, description, is_system_role) VALUES
  ('role-org-owner', 'org_owner', 'Organization Owner', 'organization', 'Full access to organization and all features', 0),
  ('role-admin', 'admin', 'Administrator', 'organization', 'Manage users, roles, settings within org', 0),
  ('role-manager', 'manager', 'Manager', 'organization', 'Manage cases and assign users', 0),
  ('role-investigator', 'investigator', 'Investigator', 'organization', 'Create cases, upload evidence, run analysis', 0),
  ('role-analyst', 'analyst', 'Analyst', 'organization', 'Read and analyze data, run AI queries', 0),
  ('role-viewer', 'viewer', 'Viewer', 'organization', 'Read-only access to assigned cases', 0),
  ('role-guest', 'guest', 'Guest', 'organization', 'Limited read access to specific cases', 0);

-- Seed property-level roles (scoped within cases)
INSERT OR IGNORE INTO roles (id, name, display_name, scope, description, is_system_role) VALUES
  ('role-property-owner', 'property_owner', 'Property Owner', 'organization', 'Owner of a property under analysis', 0),
  ('role-attorney', 'attorney', 'Attorney', 'organization', 'Legal representation for a case', 0),
  ('role-consultant', 'consultant', 'Consultant', 'organization', 'External consultant on a case', 0),
  ('role-expert-witness', 'expert_witness', 'Expert Witness', 'organization', 'Expert witness for a case', 0);

-- ═══════════════════════════════════════════════════════════════
-- PERMISSIONS (central permission registry)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_perms_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_perms_category ON permissions(category);

-- Seed permission registry
INSERT OR IGNORE INTO permissions (id, code, category, description) VALUES
  -- Properties
  ('perm-props-view', 'properties.view', 'properties', 'View properties'),
  ('perm-props-edit', 'properties.edit', 'properties', 'Edit property details'),
  ('perm-props-delete', 'properties.delete', 'properties', 'Delete properties'),
  -- Cases
  ('perm-cases-view', 'cases.view', 'cases', 'View cases'),
  ('perm-cases-create', 'cases.create', 'cases', 'Create new cases'),
  ('perm-cases-edit', 'cases.edit', 'cases', 'Edit case details'),
  ('perm-cases-close', 'cases.close', 'cases', 'Close or reopen cases'),
  ('perm-cases-assign', 'cases.assign', 'cases', 'Assign users to cases'),
  -- Evidence
  ('perm-evi-view', 'evidence.view', 'evidence', 'View evidence'),
  ('perm-evi-upload', 'evidence.upload', 'evidence', 'Upload new evidence'),
  ('perm-evi-delete', 'evidence.delete', 'evidence', 'Delete evidence'),
  ('perm-evi-export', 'evidence.export', 'evidence', 'Export evidence files'),
  -- Timeline
  ('perm-tl-view', 'timeline.view', 'timeline', 'View timeline events'),
  ('perm-tl-edit', 'timeline.edit', 'timeline', 'Edit or create timeline events'),
  -- Permits
  ('perm-perm-view', 'permits.view', 'permits', 'View building permits'),
  -- Code enforcement
  ('perm-code-view', 'code.view', 'code_enforcement', 'View code enforcement cases'),
  -- Mail
  ('perm-mail-send', 'mail.send', 'mail', 'Send mail correspondence'),
  ('perm-mail-certified', 'mail.certified', 'mail', 'Send certified mail'),
  -- AI
  ('perm-ai-run', 'ai.run', 'ai', 'Run AI analysis agents'),
  ('perm-ai-configure', 'ai.configure', 'ai', 'Configure AI agent settings'),
  -- Admin
  ('perm-users-manage', 'users.manage', 'admin', 'Manage users and memberships'),
  ('perm-orgs-manage', 'organizations.manage', 'admin', 'Manage organizations'),
  ('perm-features-manage', 'features.manage', 'admin', 'Manage feature registry'),
  ('perm-system-admin', 'system.admin', 'admin', 'Full system administration'),
  -- Audit
  ('perm-audit-view', 'audit.view', 'audit', 'View audit logs'),
  ('perm-audit-export', 'audit.export', 'audit', 'Export audit logs'),
  -- API Keys
  ('perm-apikeys-manage', 'apikeys.manage', 'admin', 'Create and revoke API keys');

-- ═══════════════════════════════════════════════════════════════
-- ROLE PERMISSIONS (junction: roles ↔ permissions)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roleperm_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_roleperm_perm_id ON role_permissions(permission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roleperm_unique ON role_permissions(role_id, permission_id);

-- Seed role → permission mappings
-- Super Admin: everything
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin';

-- Platform Admin: everything except system.admin
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'platform_admin' AND p.code != 'system.admin';

-- Org Owner: all org-scoped permissions
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'org_owner' AND p.category IN ('properties','cases','evidence','timeline','permits','code_enforcement','mail','ai','admin','audit','apikeys');

-- Admin: manage users, view/edit cases and evidence, no org management
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.code IN ('properties.view','properties.edit','cases.view','cases.create','cases.edit','cases.assign','evidence.view','evidence.upload','evidence.delete','evidence.export','timeline.view','timeline.edit','permits.view','code.view','mail.send','mail.certified','ai.run','users.manage','audit.view');

-- Manager: manage cases, assign users, upload evidence
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager' AND p.code IN ('properties.view','cases.view','cases.create','cases.edit','cases.assign','evidence.view','evidence.upload','evidence.export','timeline.view','timeline.edit','permits.view','code.view','ai.run');

-- Investigator: create cases, upload evidence, run AI
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'investigator' AND p.code IN ('properties.view','cases.view','cases.create','evidence.view','evidence.upload','evidence.export','timeline.view','timeline.edit','permits.view','code.view','ai.run','mail.send');

-- Analyst: read + analyze
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'analyst' AND p.code IN ('properties.view','cases.view','evidence.view','timeline.view','permits.view','code.view','ai.run');

-- Viewer: read-only
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'viewer' AND p.code IN ('properties.view','cases.view','evidence.view','timeline.view','permits.view','code.view');

-- Support: read-only across platform
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 'rp-' || r.id || '-' || p.id, r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'support' AND p.code IN ('properties.view','cases.view','evidence.view','timeline.view','permits.view','code.view','audit.view');

-- ═══════════════════════════════════════════════════════════════
-- FEATURE REGISTRY (platform capabilities toggleable per org)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'platform',
  is_default INTEGER DEFAULT 0,
  is_pilot INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_features_code ON features(code);
CREATE INDEX IF NOT EXISTS idx_features_category ON features(category);

-- Seed feature registry
INSERT OR IGNORE INTO features (id, code, name, category, is_default, is_pilot) VALUES
  ('feat-gis', 'gis', 'GIS Parcel Mapping', 'core', 1, 0),
  ('feat-evidence', 'evidence', 'Evidence Vault', 'core', 1, 0),
  ('feat-timeline', 'timeline', 'Timeline Generation', 'core', 1, 0),
  ('feat-due-process', 'due_process', 'Due Process Analysis', 'core', 1, 0),
  ('feat-intel', 'property_intelligence', 'Property Intelligence', 'recon', 1, 0),
  ('feat-evidence-explorer', 'evidence_explorer', 'Evidence Explorer', 'advanced', 0, 1),
  ('feat-authority-chain', 'authority_chain', 'Authority Chain', 'advanced', 0, 1),
  ('feat-certified-mail', 'certified_mail', 'Certified Mail', 'integrations', 0, 0),
  ('feat-public-records', 'public_records', 'Public Records Scraping', 'integrations', 0, 0),
  ('feat-ai-reports', 'ai_reports', 'AI Report Generation', 'ai', 0, 1),
  ('feat-gis-layers', 'gis_layers', 'Custom GIS Layers', 'advanced', 0, 0),
  ('feat-capital-risk', 'capital_risk', 'Capital & Risk Analysis', 'advanced', 0, 0);

-- Organization → Enabled Features (junction)
CREATE TABLE IF NOT EXISTS organization_features (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  enabled_at TEXT DEFAULT (datetime('now')),
  enabled_by TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_orgfeat_org_id ON organization_features(organization_id);
CREATE INDEX IF NOT EXISTS idx_orgfeat_feature_id ON organization_features(feature_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgfeat_unique ON organization_features(organization_id, feature_id);

-- ═══════════════════════════════════════════════════════════════
-- AUDIT LOGS (append-only chain of custody)
-- NEVER update or delete from this table — it is the legal evidence trail.
-- Enforce append-only via application layer (no UPDATE/DELETE statements).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  case_id TEXT REFERENCES cases(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  resource_name TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_case_id ON audit_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- ═══════════════════════════════════════════════════════════════
-- SYSTEM EVENTS (operational events — broader than audit logs)
-- Separate from audit logs: this is for ops monitoring, not legal evidence.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY,
  event_category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT,
  message TEXT NOT NULL,
  details TEXT,
  organization_id TEXT REFERENCES organizations(id),
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_category ON system_events(event_category);
CREATE INDEX IF NOT EXISTS idx_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_org_id ON system_events(organization_id);

-- ═══════════════════════════════════════════════════════════════
-- AI AGENTS (first-class citizens with scoped permissions)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  description TEXT,
  organization_id TEXT REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'registered',
  allowed_data_sources TEXT,
  allowed_actions TEXT,
  rate_limit_per_min INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  max_concurrent INTEGER DEFAULT 1,
  api_key_hash TEXT,
  last_active_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_org_id ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON ai_agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON ai_agents(status);

-- AI Agent Permissions (junction: agents ↔ permissions)
CREATE TABLE IF NOT EXISTS ai_agent_permissions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agentperm_agent ON ai_agent_permissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agentperm_perm ON ai_agent_permissions(permission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentperm_unique ON ai_agent_permissions(agent_id, permission_id);

-- ═══════════════════════════════════════════════════════════════
-- API KEYS (personal and organization API keys with scoped permissions)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  user_id TEXT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT,
  expires_at TEXT,
  last_used_at TEXT,
  is_revoked INTEGER DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apikeys_org_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_apikeys_revoked ON api_keys(is_revoked);

-- ═══════════════════════════════════════════════════════════════
-- USER PROFILES (extended user data beyond Supabase Auth)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  phone TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  notification_prefs TEXT,
  saved_searches TEXT,
  saved_map_views TEXT,
  recent_activity TEXT,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profile_user_id ON user_profiles(user_id);

-- ═══════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  case_id TEXT REFERENCES cases(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  action_url TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notif_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at);
