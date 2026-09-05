-- 001_recorder_records.sql
-- County recorder records (deeds, liens, notices).
--
-- MOVED from database/d1/003_recorder_records.sql, where it sat OUTSIDE the
-- migrations directory wrangler applies (`migrations_dir` in wrangler.toml).
-- Because it never ran on a fresh database, 008_trust_boundary.sql died on
-- `ALTER TABLE recorder_records` partway through — silently skipping every
-- statement after it, including the default organization seed that all
-- org-scoped queries depend on. A database built from scratch was therefore
-- unusable, which stayed hidden because the migration chain had never been
-- run end to end.
--
-- Numbered 001 so it precedes 008 on a fresh build. Every statement is
-- guarded, so applying it to a database that already has the table is a no-op.

CREATE TABLE IF NOT EXISTS recorder_records (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  document_number TEXT,
  document_type TEXT NOT NULL,
  recording_date TEXT,
  parties       TEXT,
  legal_description TEXT,
  document_summary TEXT,
  source_url    TEXT,
  raw_data      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add rule_name column to due_process_findings if not exists
-- (already exists in live DB, added here for fresh deployments)
