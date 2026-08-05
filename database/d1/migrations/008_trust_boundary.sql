-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008: Trust Boundary Layer (Phase 1D)
--
-- RECONCILED with migrations 004-007.
-- Does NOT recreate tables from 004 (organizations, organization_members,
-- audit_logs, roles, permissions). Uses them as-is.
--
-- Adds:
--   1. Standalone auth (users, sessions) — replaces Supabase auth dependency
--   2. Organization-scoped columns on resource tables
--   3. Actor provenance columns on timeline_events (complements events table)
--   4. Evidence custody columns
--   5. Session fixation columns on organization_members
--
-- Apply with:
--   wrangler d1 execute fairprocess --file=database/d1/migrations/008_trust_boundary.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Standalone Auth Tables ───────────────────────────────────────────────
-- Migration 004 used user_profiles (extending Supabase auth.uid).
-- This adds standalone D1-based auth so the system no longer depends on
-- Supabase. The user_id in organization_members now maps to users.id.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ── 2. Organization-scoped columns on resource tables ───────────────────────
-- Properties are shared county-wide data; NOT org-scoped.
-- Projects and everything below them ARE org-scoped.
-- Uses the organizations table from migration 004.

ALTER TABLE projects ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);

ALTER TABLE evidence ADD COLUMN organization_id TEXT;
ALTER TABLE evidence ADD COLUMN uploaded_by TEXT;
ALTER TABLE evidence ADD COLUMN sha256_hash TEXT;
ALTER TABLE evidence ADD COLUMN content_type TEXT;
ALTER TABLE evidence ADD COLUMN original_filename TEXT;
ALTER TABLE evidence ADD COLUMN uploaded_at TEXT;
ALTER TABLE evidence ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN withdrawn_at TEXT;
ALTER TABLE evidence ADD COLUMN withdrawn_by TEXT;
CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(organization_id);

ALTER TABLE timeline_events ADD COLUMN organization_id TEXT;
ALTER TABLE timeline_events ADD COLUMN actor_type TEXT;
ALTER TABLE timeline_events ADD COLUMN actor_id TEXT;
ALTER TABLE timeline_events ADD COLUMN actor_organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_timeline_org ON timeline_events(organization_id);

ALTER TABLE due_process_findings ADD COLUMN organization_id TEXT;
ALTER TABLE due_process_findings ADD COLUMN reviewed_by TEXT;
ALTER TABLE due_process_findings ADD COLUMN reviewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_findings_org ON due_process_findings(organization_id);

ALTER TABLE building_permits ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_permits_org ON building_permits(organization_id);

ALTER TABLE code_enforcement_cases ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_enforcement_org ON code_enforcement_cases(organization_id);

ALTER TABLE recorder_records ADD COLUMN organization_id TEXT;
CREATE INDEX IF NOT EXISTS idx_recorder_org ON recorder_records(organization_id);

-- ── 3. Seed: default organization ───────────────────────────────────────────
-- Every deployment gets a default org so existing data can be associated.

INSERT OR IGNORE INTO organizations (id, name, slug, org_type, status) VALUES
  ('org_default', 'Default Organization', 'default', 'individual', 'active');
