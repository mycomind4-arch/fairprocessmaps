-- Migration 020: response drafts and generated response artifacts
--
-- Evidence compatibility columns are repaired before migration execution by
-- scripts/bootstrap-d1-migrations.sh because the production evidence table
-- predates Wrangler's migration journal. This migration only creates the
-- response-draft lineage and its indexes; it contains no duplicate ALTER TABLE.

CREATE TABLE IF NOT EXISTS response_drafts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  recipient_name TEXT,
  recipient_company TEXT,
  recipient_address1 TEXT,
  recipient_address2 TEXT,
  recipient_city TEXT,
  recipient_state TEXT,
  recipient_postal_code TEXT,
  recipient_country TEXT NOT NULL DEFAULT 'US',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_response_drafts_case
  ON response_drafts(case_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_drafts_org
  ON response_drafts(organization_id, updated_at DESC);

-- Backfill canonical evidence ownership after compatibility columns exist.
UPDATE evidence
SET case_id = (
  SELECT cp.case_id FROM case_projects cp
  WHERE cp.project_id = evidence.project_id
  ORDER BY CASE WHEN cp.role = 'primary' THEN 0 ELSE 1 END
  LIMIT 1
)
WHERE case_id IS NULL;

UPDATE evidence
SET organization_id = (
  SELECT p.organization_id FROM projects p WHERE p.id = evidence.project_id LIMIT 1
)
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_response_draft ON evidence(response_draft_id);
