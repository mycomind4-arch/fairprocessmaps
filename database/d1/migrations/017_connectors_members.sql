-- 017_connectors_members.sql
-- Backend wiring for ConnectorsPanel and AdminPanel.
-- Replaces localStorage-only state with D1-backed persistence.

-- ── Project Connectors ──
CREATE TABLE IF NOT EXISTS project_connectors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'data_source',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  last_sync TEXT,
  endpoint TEXT,
  config TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_connectors_project_id ON project_connectors(project_id);
CREATE INDEX IF NOT EXISTS idx_connectors_org ON project_connectors(organization_id);

-- ── Project Members ──
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT,
  name TEXT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_members_org ON project_members(organization_id);

-- ── Project Settings (key-value overlay) ──
-- Stored as a single JSON blob per project so the AdminPanel can
-- persist all settings without altering the projects table schema.
CREATE TABLE IF NOT EXISTS project_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  organization_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_org ON project_settings(organization_id);
