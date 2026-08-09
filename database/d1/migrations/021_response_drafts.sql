-- Response drafts are human-reviewable work product generated from case findings.
-- They are not evidence until finalized and attached to an evidence record.
CREATE TABLE IF NOT EXISTS response_drafts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  recipient_name TEXT,
  recipient_company TEXT,
  recipient_address1 TEXT,
  recipient_address2 TEXT,
  recipient_city TEXT,
  recipient_state TEXT,
  recipient_postal_code TEXT,
  recipient_country TEXT DEFAULT 'US',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','finalized','withdrawn')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_response_drafts_case
  ON response_drafts(case_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_drafts_org
  ON response_drafts(organization_id, updated_at DESC);
