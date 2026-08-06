-- Migration 015: Generated Briefs
-- Stores AI-generated legal briefs for cases

CREATE TABLE IF NOT EXISTS generated_briefs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  brief_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  finding_count INTEGER NOT NULL DEFAULT 0,
  citation_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_briefs_project_id ON generated_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_briefs_org_id ON generated_briefs(organization_id);
CREATE INDEX IF NOT EXISTS idx_briefs_type ON generated_briefs(brief_type);
CREATE INDEX IF NOT EXISTS idx_briefs_generated_at ON generated_briefs(generated_at);
