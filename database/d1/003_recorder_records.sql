-- 003_recorder_records.sql
-- Add recorder_records table for county recorder records (deeds, liens, notices)

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
