-- 016_missing_info_column.sql
-- Add structured missing_info column to due_process_findings
-- so the rules engine can explicitly flag findings about missing information
-- instead of relying on free-text string matching in the UI.

ALTER TABLE due_process_findings ADD COLUMN missing_info INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_findings_missing_info ON due_process_findings(missing_info) WHERE missing_info = 1;
