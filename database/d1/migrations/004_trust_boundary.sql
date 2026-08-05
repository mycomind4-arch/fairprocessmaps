-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004: Trust Boundary Layer (Phase 1D)
--
-- Adds identity model (users, organizations, memberships, sessions),
-- organization-scoped resource boundaries, actor provenance on events,
-- and evidence custody columns.
--
-- Apply with:
--   wrangler d1 execute fairprocess --file=database/d1/migrations/004_trust_boundary.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Identity Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL DEFAULT 'viewer',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON memberships(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_user_org ON memberships(user_id, organization_id);

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
-- Properties are shared county-wide parcel data; NOT org-scoped.
-- Projects and everything below them IS org-scoped.

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

-- ── 3. Audit ledger for actor-provenanced actions ──────────────────────────

CREATE TABLE IF NOT EXISTS audit_events (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  actor_type      TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  actor_organization_id TEXT,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at);

-- ── 4. Seed: default organization ───────────────────────────────────────────
-- Every deployment gets a default org so existing data can be migrated.

INSERT OR IGNORE INTO organizations (id, name) VALUES ('org_default', 'Default Organization');
